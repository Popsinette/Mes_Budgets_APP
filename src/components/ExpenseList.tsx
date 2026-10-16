import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Card } from '@/src/components/ui/Card';
import { CheckRow } from '@/src/components/ui/CheckRow';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { useSQLiteContext } from 'expo-sqlite';
import { setExpenseCleared, type Expense } from '@/src/features/envelopes/repository';
import { spacing } from '@/src/theme';
import { numericDate } from '@/src/utils/dates';

/** Liste de dépenses : toucher pour modifier, coche pour pointer (débitée), appui long pour supprimer. */
export function ExpenseList({
  expenses,
  empty,
  onDelete,
}: {
  expenses: Expense[];
  empty: string;
  onDelete: (expense: Expense) => void;
}) {
  const db = useSQLiteContext();
  if (expenses.length === 0) {
    return (
      <Card>
        <EmptyState icon="receipt-outline" title="Aucune dépense" subtitle={empty} />
      </Card>
    );
  }
  return (
    <Card style={styles.listCard}>
      {expenses.map((expense, i) => (
        <CheckRow
          key={expense.id}
          icon={expense.envelope_icon}
          iconColor={expense.envelope_color}
          title={expense.label}
          subtitle={`${numericDate(expense.date)}${expense.cleared_at ? '' : ' · à pointer'}`}
          checked={Boolean(expense.cleared_at)}
          onToggle={() => void setExpenseCleared(db, expense.id, !expense.cleared_at)}
          checkLabels={['pointée (débitée)', 'à pointer']}
          cents={expense.amount_cents}
          sign={-1}
          onPress={() => router.push({ pathname: '/depense', params: { id: String(expense.id) } })}
          onLongPress={() => onDelete(expense)}
          last={i === expenses.length - 1}
        />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  listCard: {
    paddingVertical: spacing.xs,
  },
});
