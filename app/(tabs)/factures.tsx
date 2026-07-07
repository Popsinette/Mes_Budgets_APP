import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { confirmAction } from '@/src/utils/dialogs';
import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteBill,
  getBillsSummary,
  listBillsForMonth,
  setBillPaid,
  type BillWithStatus,
} from '@/src/features/bills/repository';
import { spacing, useTheme } from '@/src/theme';
import { currentMonthKey } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

export default function BillsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [month, setMonth] = useState(currentMonthKey());
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

  const renderBill = (bill: BillWithStatus) => {
    const isPaid = Boolean(bill.paid_at);
    return (
      <Card key={bill.id} style={styles.billCard} onPress={() => togglePaid(bill)} onLongPress={() => confirmDelete(bill)}>
        <Pressable hitSlop={6} onPress={() => togglePaid(bill)}>
          <Ionicons
            name={isPaid ? 'checkmark-circle' : 'ellipse-outline'}
            size={26}
            color={isPaid ? theme.colors.success : theme.colors.textMuted}
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.billName,
              { color: theme.colors.text, textDecorationLine: isPaid ? 'line-through' : 'none' },
            ]}
            numberOfLines={1}
          >
            {bill.name}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
            Échéance le {bill.due_day} du mois
            {bill.category_name ? ` · ${bill.category_name}` : ''}
          </Text>
        </View>
        <Text style={[styles.billAmount, { color: isPaid ? theme.colors.textMuted : theme.colors.text }]}>
          {formatCents(bill.amount_cents)}
        </Text>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={72}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Factures</Text>
        <MonthSwitcher month={month} onChange={setMonth} />

        {total > 0 ? (
          <Card style={{ gap: spacing.md }}>
            <View style={styles.summaryRow}>
              <Text style={{ color: theme.colors.textMuted, fontWeight: '600' }}>Réglées ce mois</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
                {formatCents(paidTotal)}{' '}
                <Text style={{ color: theme.colors.textMuted, fontWeight: '600' }}>/ {formatCents(total)}</Text>
              </Text>
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
                <SectionHeader title={`À payer (${unpaid.length})`} />
                {unpaid.map(renderBill)}
              </>
            ) : null}
            {paid.length > 0 ? (
              <>
                <SectionHeader title={`Réglées (${paid.length})`} />
                {paid.map(renderBill)}
              </>
            ) : null}
            <Text style={{ color: theme.colors.textMuted, fontSize: 12, textAlign: 'center' }}>
              Touchez une facture pour la pointer · appui long pour la supprimer
            </Text>
          </>
        )}
      </Screen>
      <FAB onPress={() => router.push('/nouvelle-facture')} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  billCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  billName: {
    fontSize: 15,
    fontWeight: '700',
  },
  billAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
});
