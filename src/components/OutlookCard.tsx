import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getPlanOutlook } from '@/src/features/summary/repository';
import { useSelectedMonth } from '@/src/store/month';
import { spacing, useTheme } from '@/src/theme';
import { currentMonthKey, monthKeyLabel } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';
import { Card } from './ui/Card';
import { Body, Caption, Heading, Money } from './ui/Text';

/**
 * « Les prochains mois » : le plan de chaque mois à venir (revenus − charges
 * − enveloppes − épargne programmée), sans tenir compte du solde du compte.
 * Toucher un mois l'affiche partout dans l'app.
 */
export function OutlookCard() {
  const theme = useTheme();
  const selected = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const from = currentMonthKey();
  const { data: months } = useLiveQuery((db) => getPlanOutlook(db, from, 6), [from]);
  if (!months) return null;

  return (
    <Card style={{ gap: spacing.xs }}>
      <Heading>Les prochains mois</Heading>
      <Caption style={{ marginBottom: spacing.xs }}>
        Revenus − charges fixes − enveloppes − épargne programmée, mois par mois. Ton solde actuel n’entre pas en
        compte. Touche un mois pour le détailler.
      </Caption>
      {months.map((m, i) => {
        const label = monthKeyLabel(m.month);
        const isSelected = m.month === selected;
        const red = m.left_cents < 0;
        return (
          <Pressable
            key={m.month}
            onPress={() => setMonth(m.month)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${label} : reste ${formatCents(m.left_cents)}`}
            style={({ pressed }) => [
              styles.row,
              i < months.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline },
              isSelected && { backgroundColor: theme.colors.primarySoft },
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Body weight="semibold">
                {label.charAt(0).toUpperCase() + label.slice(1)}
                {m.month === from ? ' · en cours' : ''}
              </Body>
              <Caption>
                Revenus {formatCents(m.income_cents, { compact: true })} · Dépenses{' '}
                {formatCents(m.expense_cents, { compact: true })} · Épargne {formatCents(m.savings_cents, { compact: true })}
              </Caption>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Money cents={m.left_cents} signed={m.left_cents !== 0} size={15.5} weight="bold" tone={red ? 'danger' : 'text'} />
              {red ? (
                <View style={styles.badge}>
                  <Ionicons name="alert-circle" size={12} color={theme.colors.danger} />
                  <Caption tone="danger">dans le rouge</Caption>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    borderRadius: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
});
