import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
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
import { seedDefaults } from '@/src/db/schema';
import { exportAllDataAsJson, exportExpensesAsCsv } from '@/src/features/export/exporter';
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

  const eraseAllData = () => {
    confirmAction({
      title: 'Tout effacer',
      message:
        'Toutes vos données (dépenses, enveloppes, revenus et charges fixes, épargne) seront définitivement supprimées de cet appareil. Cette action est irréversible.',
      confirmLabel: 'Tout effacer',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await db.withTransactionAsync(async () => {
            await db.execAsync(`
              DELETE FROM week_closures;
              DELETE FROM savings_moves;
              DELETE FROM savings_pots;
              DELETE FROM fixed_checks;
              DELETE FROM fixed_items;
              DELETE FROM expenses;
              DELETE FROM envelopes;
            `);
            await seedDefaults(db);
          });
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
        <Heading>Exporter mes données</Heading>
        <Body tone="muted" size={13.5}>
          Sauvegarde complète (JSON) ou dépenses seules (CSV, pour Excel/Numbers), via la feuille de
          partage : AirDrop, Fichiers, mail…
        </Body>
        <Button
          label="Exporter tout (JSON)"
          onPress={() => void runExport(() => exportAllDataAsJson(db), setExportingJson)}
          loading={exportingJson}
        />
        <Button
          label="Exporter les dépenses (CSV)"
          variant="secondary"
          onPress={() => void runExport(() => exportExpensesAsCsv(db), setExportingCsv)}
          loading={exportingCsv}
        />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Heading>Données</Heading>
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
          Charges fixes, enveloppes de la semaine et épargne — 100 % local.
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
