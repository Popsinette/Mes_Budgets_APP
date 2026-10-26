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
import { seedPots, upgradeLegacyColors } from '@/src/db/schema';
import { seedBase } from '@/src/features/envelopes/repository';
import { backupStats, getBackupStatus, getMeta, OPEN_ON_EXPENSE_KEY, parseBackup, restoreBackup, setMeta } from '@/src/features/backup/repository';
import { pickJsonFileText } from '@/src/features/backup/pickFile';
import { exportAllDataAsJson, exportExpensesAsCsv } from '@/src/features/export/exporter';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { numericDate } from '@/src/utils/dates';
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
  const [restoring, setRestoring] = useState(false);
  const { data: backup } = useLiveQuery((db) => getBackupStatus(db), []);

  const restore = async () => {
    setRestoring(true);
    try {
      const text = await pickJsonFileText();
      if (text === null) return;
      const parsed = parseBackup(text);
      const stats = backupStats(parsed);
      confirmAction({
        title: 'Restaurer cette sauvegarde ?',
        message: `Sauvegarde du ${numericDate(stats.exportedAt.slice(0, 10))} : ${stats.expenses} dépense(s), ${stats.fixed} revenu(s) et charge(s), ${stats.pots} cagnotte(s).\n\nToutes les données actuelles de cet appareil seront remplacées.`,
        confirmLabel: 'Restaurer',
        destructive: true,
        onConfirm: () => {
          void (async () => {
            try {
              await restoreBackup(db, parsed);
              notify('Sauvegarde restaurée', 'Tes données ont été remplacées par celles de la sauvegarde.');
            } catch (error) {
              notify('Restauration impossible', error instanceof Error ? error.message : String(error));
            }
          })();
        },
      });
    } catch (error) {
      notify('Restauration impossible', error instanceof Error ? error.message : String(error));
    } finally {
      setRestoring(false);
    }
  };

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
        'Toutes vos données (dépenses, enveloppes, revenus et charges fixes, santé, cagnottes) seront définitivement supprimées de cet appareil. Cette action est irréversible.',
      confirmLabel: 'Tout effacer',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await db.withTransactionAsync(async () => {
            await db.execAsync(`
              DELETE FROM habit_logs;
              DELETE FROM expense_habits;
              DELETE FROM account;
              DELETE FROM health_expenses;
              DELETE FROM week_closures;
              DELETE FROM month_closures;
              DELETE FROM savings_skips;
              DELETE FROM savings_moves;
              DELETE FROM savings_pots;
              DELETE FROM fixed_checks;
              DELETE FROM fixed_items;
              DELETE FROM expenses;
              DELETE FROM envelopes;
              DELETE FROM envelope_templates;
              DELETE FROM envelope_months_ready;
            `);
            await seedBase(db);
            await seedPots(db);
            await upgradeLegacyColors(db);
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
        <Heading>Mes enveloppes</Heading>
        <Body tone="muted" size={13.5}>
          Montants de tes enveloppes de la semaine et de tes montants fixes du mois.
        </Body>
        <Button label="Gérer mes enveloppes" variant="secondary" onPress={() => router.push('/enveloppes')} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Heading>Habitudes et année</Heading>
        <Body tone="muted" size={13.5}>
          Les dépenses qui reviennent (cantine, essence…) et les grosses charges de l’année à lisser.
        </Body>
        <Button label="Mes habitudes" variant="secondary" onPress={() => router.push('/habitudes')} />
        <Button label="Mon année" variant="secondary" onPress={() => router.push('/annee')} />
      </Card>

      <QuickAccessCard />

      <Card style={{ gap: spacing.md }}>
        <Heading>Sauvegarde</Heading>
        <Body tone="muted" size={13.5}>
          Tes données ne sont que sur cet appareil. Garde une sauvegarde (JSON) ailleurs — Fichiers, iCloud Drive,
          mail… — pour la restaurer si tu changes de téléphone ou si le navigateur efface ses données.
        </Body>
        {backup ? (
          <Body size={13.5} tone={backup.due ? 'danger' : 'muted'} weight={backup.due ? 'semibold' : 'regular'}>
            {backup.last_at
              ? `Dernière sauvegarde : le ${numericDate(backup.last_at.slice(0, 10))}${
                  backup.days === 0 ? ' (aujourd’hui)' : backup.days === 1 ? ' (hier)' : ` (il y a ${backup.days} jours)`
                }`
              : 'Aucune sauvegarde pour l’instant.'}
          </Body>
        ) : null}
        <Button
          label="Sauvegarder tout (JSON)"
          onPress={() => void runExport(() => exportAllDataAsJson(db), setExportingJson)}
          loading={exportingJson}
        />
        <Button label="Restaurer une sauvegarde" variant="secondary" onPress={() => void restore()} loading={restoring} />
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
          Budget variable, charges fixes, revenus, santé et cagnottes — 100 % local.
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

/**
 * Noter une dépense en un geste : ouvrir l'app directement sur « Nouvelle
 * dépense » (réglage stocké dans app_meta), et sur Android les raccourcis de
 * l'icône (manifest « shortcuts »).
 */
function QuickAccessCard() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { data: on } = useLiveQuery(async (db) => (await getMeta(db, OPEN_ON_EXPENSE_KEY)) === '1', []);
  const toggle = async (next: boolean) => {
    await setMeta(db, OPEN_ON_EXPENSE_KEY, next ? '1' : null);
    invalidateQueries();
  };
  return (
    <Card style={{ gap: spacing.md }}>
      <Heading>Noter une dépense en un geste</Heading>
      <View style={styles.toggleRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Body weight="semibold">Ouvrir sur « Nouvelle dépense »</Body>
          <Caption>À chaque ouverture de l’app, le formulaire de dépense s’affiche directement (fermer = ton budget).</Caption>
        </View>
        <Switch value={Boolean(on)} onValueChange={(next) => void toggle(next)} trackColor={{ true: theme.colors.primary }} />
      </View>
      {Platform.OS === 'web' ? (
        <Caption>Sur Android, un appui long sur l’icône de l’app propose aussi « Nouvelle dépense » et « Mes dépenses ».</Caption>
      ) : null}
    </Card>
  );
}
