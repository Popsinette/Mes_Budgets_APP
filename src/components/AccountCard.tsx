import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getAccountStatus } from '@/src/features/account/repository';
import { spacing, useTheme } from '@/src/theme';
import { formatCents } from '@/src/utils/money';
import { Card } from './ui/Card';
import { Body, Caption, Eyebrow, Money } from './ui/Text';

/** Carte « Mon compte » de l'écran Budget : solde estimé + fin de mois prévue. */
export function AccountCard() {
  const theme = useTheme();
  const { data: status, loading } = useLiveQuery((db) => getAccountStatus(db));
  if (loading) return null;

  if (!status) {
    return (
      <Card style={styles.row} onPress={() => router.push('/compte')}>
        <View style={[styles.icon, { backgroundColor: theme.colors.primarySoft }]}>
          <Ionicons name="card-outline" size={20} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Body weight="semibold">Mon compte</Body>
          <Caption>Saisis le solde de ton compte pour savoir combien il te reste vraiment.</Caption>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      </Card>
    );
  }

  const end = status.end_of_month_cents;
  return (
    <Card style={styles.row} onPress={() => router.push('/compte')}>
      <View style={[styles.icon, { backgroundColor: theme.colors.primarySoft }]}>
        <Ionicons name="card-outline" size={20} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Eyebrow>Mon compte · estimé</Eyebrow>
        <Money cents={status.balance_cents} size={22} weight="bold" tone={status.balance_cents < 0 ? 'danger' : 'text'} />
        <View style={styles.endRow}>
          <Caption>Fin de mois prévue :</Caption>
          <Money cents={end} size={13} tone={end < 0 ? 'danger' : 'text'} />
        </View>
        {status.uncleared_count > 0 ? (
          <Caption>
            {status.uncleared_count === 1 ? '1 dépense à pointer' : `${status.uncleared_count} dépenses à pointer`} ·{' '}
            {formatCents(status.uncleared_cents)}
          </Caption>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  endRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
