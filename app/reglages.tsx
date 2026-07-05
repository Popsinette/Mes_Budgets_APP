import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { invalidateQueries } from '@/src/store/invalidation';
import { spacing, useTheme } from '@/src/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();

  const eraseAllData = () => {
    Alert.alert(
      'Tout effacer',
      'Toutes vos données (transactions, budgets, épargne, factures) seront définitivement supprimées de cet appareil. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tout effacer',
          style: 'destructive',
          onPress: () => {
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
              Alert.alert('Données effacées', 'Toutes vos données ont été supprimées.');
            })();
          },
        },
      ],
    );
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
            Tout est stocké uniquement sur cet appareil, dans une base chiffrée (SQLCipher, AES-256). La clé de
            chiffrement est gardée dans l’enclave sécurisée du téléphone (Keychain iOS / Keystore Android).
            Aucune donnée ne quitte votre téléphone : pas de compte, pas de serveur, pas de suivi.
          </Text>
        </View>
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
});
