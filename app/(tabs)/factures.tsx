import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { confirmAction } from '@/src/utils/dialogs';
import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money, Title } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteBill,
  getBillsSummary,
  listBillsForMonth,
  setBillPaid,
  type BillWithStatus,
} from '@/src/features/bills/repository';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

export default function BillsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const { data: bills } = useLiveQuery((db) => listBillsForMonth(db, month), [month]);
  const { data: summary } = useLiveQuery((db) => getBillsSummary(db, month), [month]);

  const unpaid = (bills ?? []).filter((b) => !b.paid_at);
  const paid = (bills ?? []).filter((b) => b.paid_at);
  const total = summary?.total_cents ?? 0;
  const paidTotal = summary?.paid_cents ?? 0;

  const togglePaid = (bill: BillWithStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setBillPaid(db, bill.id, month, !bill.paid_at);
  };

  const confirmDelete = (bill: BillWithStatus) => {
    confirmAction({
      title: 'Supprimer la facture',
      message: `Supprimer « ${bill.name} » définitivement ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => void deleteBill(db, bill.id),
    });
  };

  const openEdit = (bill: BillWithStatus) => {
    router.push({
      pathname: '/nouvelle-facture',
      params: {
        billId: String(bill.id),
        name: bill.name,
        amount: String(bill.amount_cents),
        dueDay: String(bill.due_day),
        ...(bill.category_id ? { categoryId: String(bill.category_id) } : {}),
      },
    });
  };

  const isCurrentMonth = month === currentMonthKey();
  const today = new Date().getDate();

  const renderBill = (bill: BillWithStatus) => {
    const isPaid = Boolean(bill.paid_at);
    const isLate = !isPaid && isCurrentMonth && bill.due_day < today;
    const isSoon = !isPaid && isCurrentMonth && !isLate && bill.due_day - today <= 5;
    return (
      <Card key={bill.id} style={styles.billCard}>
        <Pressable
          style={styles.billMain}
          onPress={() => togglePaid(bill)}
          onLongPress={() => confirmDelete(bill)}
        >
          <Ionicons
            name={isPaid ? 'checkmark-circle' : 'ellipse-outline'}
            size={25}
            color={isPaid ? theme.colors.success : theme.colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <View style={styles.billNameRow}>
              <Body
                weight="semibold"
                numberOfLines={1}
                style={isPaid ? { textDecorationLine: 'line-through' } : undefined}
              >
                {bill.name}
              </Body>
              {isLate ? (
                <View style={[styles.badge, { backgroundColor: theme.colors.dangerSoft }]}>
                  <Caption tone="danger" style={styles.badgeText}>
                    En retard
                  </Caption>
                </View>
              ) : isSoon ? (
                <View style={[styles.badge, { backgroundColor: theme.colors.warningSoft }]}>
                  <Caption tone="warning" style={styles.badgeText}>
                    Bientôt
                  </Caption>
                </View>
              ) : null}
            </View>
            <Caption>
              Se répète le {bill.due_day} de chaque mois
              {bill.category_name ? ` · ${bill.category_name}` : ''}
            </Caption>
          </View>
          <Money cents={bill.amount_cents} size={15.5} weight="bold" tone={isPaid ? 'muted' : 'text'} />
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={() => openEdit(bill)}
          accessibilityRole="button"
          accessibilityLabel={`Modifier la facture ${bill.name}`}
          style={styles.billEdit}
        >
          <Ionicons name="create-outline" size={19} color={theme.colors.textMuted} />
        </Pressable>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={80}>
        <Title>Factures</Title>
        <MonthSwitcher month={month} onChange={setMonth} />

        {total > 0 ? (
          <Card style={{ gap: spacing.md }}>
            <View style={styles.summaryRow}>
              <View style={{ gap: 3 }}>
                <Eyebrow>Réglées ce mois</Eyebrow>
                <Money cents={paidTotal} size={24} weight="bold" tone="success" />
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Eyebrow>Total</Eyebrow>
                <Money cents={total} size={16} weight="semibold" tone="muted" />
              </View>
            </View>
            <ProgressBar ratio={total > 0 ? paidTotal / total : 0} color={theme.colors.success} height={10} />
          </Card>
        ) : null}

        {(bills ?? []).length === 0 ? (
          <Card>
            <EmptyState
              icon="receipt-outline"
              title="Aucune facture récurrente"
              subtitle="Ajoutez vos factures (loyer, électricité, abonnements…) pour ne plus rien oublier."
            />
          </Card>
        ) : (
          <>
            {unpaid.length > 0 ? (
              <>
                <SectionHeader title={`À payer · ${unpaid.length}`} />
                {unpaid.map(renderBill)}
              </>
            ) : null}
            {paid.length > 0 ? (
              <>
                <SectionHeader title={`Réglées · ${paid.length}`} />
                {paid.map(renderBill)}
              </>
            ) : null}
            <Caption style={{ textAlign: 'center' }}>
              Touchez une facture pour la pointer payée — la dépense est ajoutée automatiquement à votre
              activité (hors budgets). Icône ✎ pour la modifier, appui long pour la supprimer.
            </Caption>
          </>
        )}
      </Screen>
      <FAB onPress={() => router.push('/nouvelle-facture')} />
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  billCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  billMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  billNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  billEdit: {
    padding: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10.5,
  },
});
