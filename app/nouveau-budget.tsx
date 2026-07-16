import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { notify } from '@/src/utils/dialogs';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { CategoryPicker } from '@/src/components/ui/CategoryPicker';
import { AmountField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Eyebrow } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getBillsSummary } from '@/src/features/bills/repository';
import { listBudgetsWithSpending, upsertBudget } from '@/src/features/budgets/repository';
import { getPlannedSavingsForMonth } from '@/src/features/savings/repository';
import { getMonthTotals } from '@/src/features/transactions/repository';
import { spacing } from '@/src/theme';
import { useSelectedMonth } from '@/src/store/month';
import { currentMonthKey, monthKeyLabel } from '@/src/utils/dates';
import { formatCents, parseAmountToCents } from '@/src/utils/money';

export default function NewBudgetScreen() {
  const db = useSQLiteContext();
  const globalMonth = useSelectedMonth((s) => s.month);
  const params = useLocalSearchParams<{ month?: string; categoryId?: string; amount?: string }>();
  const month = typeof params.month === 'string' && params.month ? params.month : globalMonth;

  // Pré-remplissage quand on modifie un budget existant depuis l'écran Budgets.
  const initialCategoryId = params.categoryId ? Number(params.categoryId) : null;
  const initialAmount = params.amount ? String(Number(params.amount) / 100).replace('.', ',') : '';
  const [categoryId, setCategoryId] = useState<number | null>(initialCategoryId);
  const [amount, setAmount] = useState(initialAmount);
  const [saving, setSaving] = useState(false);

  // Contexte prévisionnel du mois, pour dimensionner le budget en connaissance
  // de cause : revenus (y compris à venir) − factures − épargne prévue − autres budgets.
  const { data: totals } = useLiveQuery((db) => getMonthTotals(db, month), [month]);
  const { data: billsSummary } = useLiveQuery((db) => getBillsSummary(db, month), [month]);
  const { data: plannedSavings } = useLiveQuery((db) => getPlannedSavingsForMonth(db, month), [month]);
  const { data: budgets } = useLiveQuery((db) => listBudgetsWithSpending(db, month), [month]);

  const income = totals?.income_cents ?? 0;
  const otherBudgetsTotal = (budgets ?? [])
    .filter((b) => b.category_id !== categoryId)
    .reduce((sum, b) => sum + b.amount_cents, 0);
  const availableBefore =
    income - (billsSummary?.total_cents ?? 0) - (plannedSavings ?? 0) - otherBudgetsTotal;
  const typedCents = parseAmountToCents(amount) ?? 0;
  const availableAfter = availableBefore - typedCents;

  const save = async () => {
    const amountCents = parseAmountToCents(amount);
    if (!categoryId) {
      notify('Catégorie manquante', 'Choisissez la catégorie à budgéter.');
      return;
    }
    if (!amountCents || amountCents <= 0) {
      notify('Montant invalide', 'Saisissez un montant valide, par exemple 300.');
      return;
    }
    setSaving(true);
    await upsertBudget(db, { categoryId, month, amountCents });
    router.back();
  };

  return (
    <Screen>
      <ModalHeader title="Nouveau budget" />
      <Body tone="muted" size={13.5}>
        Budget mensuel pour {monthKeyLabel(month)} — si un budget existe déjà pour cette catégorie, il sera
        remplacé.
      </Body>

      <AmountField label="Montant mensuel" value={amount} onChangeText={setAmount} placeholder="300" autoFocus />

      {income > 0 ? (
        <Caption tone={availableAfter < 0 ? 'danger' : 'muted'}>
          {typedCents > 0
            ? availableAfter >= 0
              ? `Après ce budget, il restera ${formatCents(availableAfter)} à allouer sur vos revenus du mois.`
              : `Ce budget dépasse de ${formatCents(-availableAfter)} ce que vos revenus du mois permettent (après factures, épargne et autres budgets).`
            : `${formatCents(availableBefore)} restent à allouer sur vos revenus du mois (après factures, épargne prévue et autres budgets).`}
        </Caption>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Catégorie</Eyebrow>
        <CategoryPicker selectedId={categoryId} onSelect={(c) => setCategoryId(c.id)} />
      </View>

      <Button label="Enregistrer" onPress={() => void save()} loading={saving} />
    </Screen>
  );
}
