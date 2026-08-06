import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Chip } from '@/src/components/ui/Chip';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Heading } from '@/src/components/ui/Text';
import { repairBillPayments } from '@/src/features/bills/repository';
import { exportAllDataAsJson, exportTransactionsAsCsv } from '@/src/features/export/exporter';
import { invalidateQueries } from '@/src/store/invalidation';
import { isBiometricAvailable, useSecurity } from '@/src/store/security';
import { useThemePref, type ThemePref } from '@/src/store/themePref';
import { spacing, useTheme } from '@/src/theme';

const THEME_CHOICES: Array<[ThemePref, string]> = [
  ['auto', 'Automatique'],
  ['light', 'Clair'],
  ['dark', 'Sombre'],
];

export default function SettingsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { biometricEnabled, setBiometricEnabled, tryUnlock } = useSecurity();
  const themePref = useThemePref((s) => s.pref);
  const setThemePref = useThemePref((s) => s.setPref);
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const toggleBiometric = async (next: boolean) => {
    if (next) {
      if (!(await isBiometricAvailable())) {
        notify(
          'Biométrie indisponible',
          'Aucune biométrie (Face ID, Touch ID ou empreinte) n’est configurée sur cet appareil.',
        );
        return;
      }
      // On vérifie que l'utilisateur peut bien se déverrouiller avant d'activer.
      const ok = await tryUnlock();
      if (!ok) return;
    }
    await setBiometricEnabled(next);
  };

  const runExport = async (
    exporter: () => Promise<void>,
    setBusy: (busy: boolean) => void,
  ) => {
    setBusy(true);
    try {
      await exporter();
    } catch (error) {
      notify('Export impossible', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const runRepair = async () => {
    setRepairing(true);
    try {
      const { relinked, unpointed, realigned } = await repairBillPayments(db);
      const fixed = relinked + unpointed + realigned;
      notify(
        fixed === 0 ? 'Tout est cohérent' : 'Données corrigées',
        fixed === 0
          ? 'Aucune facture pointée sans dépense : vos soldes sont cohérents.'
          : [
              relinked > 0
                ? `${relinked} dépense${relinked > 1 ? 's' : ''} re-rattachée${relinked > 1 ? 's' : ''} à sa facture.`
                : null,
              unpointed > 0
                ? `${unpointed} facture${unpointed > 1 ? 's' : ''} pointée${unpointed > 1 ? 's' : ''} sans dépense : remise${unpointed > 1 ? 's' : ''} « à payer ».`
                : null,
              realigned > 0
                ? `${realigned} dépense${realigned > 1 ? 's' : ''} de facture réalignée${realigned > 1 ? 's' : ''} sur le montant de la facture.`
                : null,
            ]
              .filter(Boolean)
              .join('\n'),
      );
    } catch (error) {
      notify('Vérification impossible', error instanceof Error ? error.message : String(error));
    } finally {
      setRepairing(false);
    }
  };

  const eraseAllData = () => {
    confirmAction({
      title: 'Tout effacer',
      message:
        'Toutes vos données (transactions, budgets, épargne, factures) seront définitivement supprimées de cet appareil. Cette action est irréversible.',
      confirmLabel: 'Tout effacer',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await db.execAsync(`
            DELETE FROM bill_payments;
            DELETE FROM bills;
            DELETE FROM savings_transfers;
            DELETE FROM savings_accounts;
            DELETE FROM budgets;
            DELETE FROM transactions;
          `);
          invalidateQueries();
          notify('Données effacées', 'Toutes vos données ont été supprimées.');
        })();
      },
    });
  };

  return (
    <Screen>
      <ModalHeader title="Réglages" />

      <Card style={styles.securityCard}>
        <View style={[styles.securityIcon, { backgroundColor: theme.colors.successSoft }]}>
          <Ionicons name="lock-closed" size={22} color={theme.colors.success} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Body weight="semibold">Vos données sont protégées</Body>
          <Caption>
            {Platform.OS === 'web'
              ? 'Tout est stocké uniquement sur cet appareil, dans le stockage privé du navigateur (isolé par site et protégé par le verrouillage de votre appareil). Aucune donnée ne part sur un serveur : pas de compte, pas de suivi. Pensez à exporter régulièrement une sauvegarde JSON.'
              : 'Tout est stocké uniquement sur cet appareil, dans une base chiffrée (SQLCipher, AES-256). La clé de chiffrement est gardée dans l’enclave sécurisée du téléphone (Keychain iOS / Keystore Android). Aucune donnée ne quitte votre téléphone : pas de compte, pas de serveur, pas de suivi.'}
          </Caption>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Heading>Apparence</Heading>
        <Body tone="muted" size={13.5}>
          « Automatique » suit le réglage clair/sombre de votre appareil.
        </Body>
        <View style={styles.themeRow}>
          {THEME_CHOICES.map(([value, label]) => (
            <Chip
              key={value}
              label={label}
              selected={themePref === value}
              onPress={() => setThemePref(value)}
            />
          ))}
        </View>
      </Card>

      {Platform.OS !== 'web' ? (
      <Card style={{ gap: spacing.md }}>
        <Heading>Sécurité</Heading>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Body weight="semibold">Verrouillage biométrique</Body>
            <Caption>
              Exige Face ID / Touch ID / empreinte à chaque ouverture de l’application.
            </Caption>
          </View>
          <Switch
            value={Boolean(biometricEnabled)}
            onValueChange={(next) => void toggleBiometric(next)}
            trackColor={{ true: theme.colors.primary }}
          />
        </View>
      </Card>
      ) : null}

      <Card style={{ gap: spacing.md }}>
        <Heading>Catégories</Heading>
        <Body tone="muted" size={13.5}>
          Créez vos propres catégories et personnalisez leur nom, icône et couleur.
        </Body>
        <Button label="Gérer les catégories" variant="secondary" onPress={() => router.push('/categories')} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Heading>Exporter mes données</Heading>
        <Body tone="muted" size={13.5}>
          Sauvegarde complète (JSON) ou transactions seules (CSV, pour Excel/Numbers), via la feuille de
          partage : AirDrop, Fichiers, mail…
        </Body>
        <Button
          label="Exporter tout (JSON)"
          onPress={() => void runExport(() => exportAllDataAsJson(db), setExportingJson)}
          loading={exportingJson}
        />
        <Button
          label="Exporter les transactions (CSV)"
          variant="secondary"
          onPress={() => void runExport(() => exportTransactionsAsCsv(db), setExportingCsv)}
          loading={exportingCsv}
        />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Heading>Données</Heading>
        <Body tone="muted" size={13.5}>
          La vérification cherche les factures cochées « réglées » dont la dépense n’existe plus (ou
          n’a plus le bon montant) — la cause des écarts entre le reste à vivre et le prévisionnel.
        </Body>
        <Button
          label="Vérifier mes données"
          variant="secondary"
          onPress={() => void runRepair()}
          loading={repairing}
        />
        <Body tone="muted" size={13.5}>
          Supprime définitivement toutes les données de l’application sur cet appareil.
        </Body>
        <Button label="Tout effacer" variant="danger" onPress={eraseAllData} />
      </Card>

      <Card style={{ gap: spacing.xs }}>
        <Heading>À propos</Heading>
        <Body tone="muted" size={13.5}>
          Mes Budgets · version {Constants.expoConfig?.version ?? '0.1.0'}
        </Body>
        <Body tone="muted" size={13.5}>
          Suivi de budgets mensuels, plan d’épargne et factures — 100 % local.
        </Body>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  securityCard: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  securityIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  themeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
