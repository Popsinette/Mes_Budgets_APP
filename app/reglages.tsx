import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { exportAllDataAsJson, exportTransactionsAsCsv } from '@/src/features/export/exporter';
import { invalidateQueries } from '@/src/store/invalidation';
import { isBiometricAvailable, useSecurity } from '@/src/store/security';
import { spacing, useTheme } from '@/src/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { biometricEnabled, setBiometricEnabled, tryUnlock } = useSecurity();
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
        'Toutes vos données (transactions, budgets, épargne, factures) seront définitivement supprimées de cet appareil. Cette action est irréversible.',
      confirmLabel: 'Tout effacer',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await db.execAsync(`
            DELETE FROM bill_payments;
            DELETE FROM bills;
            DELETE FROM savings_entries;
            DELETE FROM savings_goals;
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
        <View style={{ flex: 1 }}>
          <Text style={[styles.securityTitle, { color: theme.colors.text }]}>Vos données sont protégées</Text>
          <Text style={[styles.securityText, { color: theme.colors.textMuted }]}>
            {Platform.OS === 'web'
              ? 'Tout est stocké uniquement sur cet appareil, dans le stockage privé du navigateur (isolé par site et protégé par le verrouillage de votre appareil). Aucune donnée ne part sur un serveur : pas de compte, pas de suivi. Pensez à exporter régulièrement une sauvegarde JSON.'
              : 'Tout est stocké uniquement sur cet appareil, dans une base chiffrée (SQLCipher, AES-256). La clé de chiffrement est gardée dans l’enclave sécurisée du téléphone (Keychain iOS / Keystore Android). Aucune donnée ne quitte votre téléphone : pas de compte, pas de serveur, pas de suivi.'}
          </Text>
        </View>
      </Card>

      {Platform.OS !== 'web' ? (
      <Card style={{ gap: spacing.md }}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Sécurité</Text>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleLabel, { color: theme.colors.text }]}>
              Verrouillage biométrique
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 18 }}>
              Exige Face ID / Touch ID / empreinte à chaque ouverture de l’application.
            </Text>
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
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Catégories</Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          Créez vos propres catégories et personnalisez leur nom, icône et couleur.
        </Text>
        <Button label="Gérer les catégories" variant="secondary" onPress={() => router.push('/categories')} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Exporter mes données</Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          Sauvegarde complète (JSON) ou transactions seules (CSV, pour Excel/Numbers), via la feuille de
          partage : AirDrop, Fichiers, mail…
        </Text>
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
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Données</Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          Supprime définitivement toutes les données de l’application sur cet appareil.
        </Text>
        <Button label="Tout effacer" variant="danger" onPress={eraseAllData} />
      </Card>

      <Card style={{ gap: spacing.xs }}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>À propos</Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>
          Mes Budgets · version {Constants.expoConfig?.version ?? '0.1.0'}
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>
          Suivi de budgets mensuels, plan d’épargne et factures — 100 % local.
        </Text>
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
  securityTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  securityText: {
    fontSize: 13,
    lineHeight: 19,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
});
