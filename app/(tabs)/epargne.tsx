import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money, Title } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteTransfer,
  getSavingsOverview,
  listAccountsWithBalance,
  listTransfersForMonth,
  setTransferDone,
  type SavingsTransfer,
} from '@/src/features/savings/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, monthKeyLabel, shortDayLabel } from '@/src/utils/dates';
import { confirmAction } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

export default function SavingsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [month, setMonth] = useState(currentMonthKey());

  const { data: accounts } = useLiveQuery((db) => listAccountsWithBalance(db));
  const { data: overview } = useLiveQuery((db) => getSavingsOverview(db));
  const { data: transfers } = useLiveQuery((db) => listTransfersForMonth(db, month), [month]);

  const totalReal = overview?.total_real_cents ?? 0;
  const totalPlanned = overview?.total_planned_cents ?? 0;

  const transfersByAccount = useMemo(() => {
    const map = new Map<number, SavingsTransfer[]>();
    for (const t of transfers ?? []) {
      const list = map.get(t.account_id) ?? [];
      list.push(t);
      map.set(t.account_id, list);
    }
    return map;
  }, [transfers]);

  const toggleDone = (t: SavingsTransfer) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setTransferDone(db, t.id, t.done !== 1);
  };

  const confirmDeleteTransfer = (t: SavingsTransfer) => {
    confirmAction({
      title: 'Supprimer le virement',
      message: `Supprimer ce virement de ${formatCents(t.amount_cents)} ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => void deleteTransfer(db, t.id),
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={80}>
        <Title>Épargne</Title>

        <View style={styles.hero}>
          <Eyebrow tone="success">Épargne totale</Eyebrow>
          <Money cents={totalReal} size={44} weight="xbold" tone="success" style={{ marginTop: 2 }} />
          <Caption style={{ marginTop: 4 }}>
            {totalPlanned > totalReal
              ? `${formatCents(totalPlanned)} avec les virements prévus`
              : 'Somme de tous vos comptes'}
          </Caption>
        </View>

        <MonthSwitcher month={month} onChange={setMonth} />

        <SectionHeader title="Mes comptes" actionLabel="Nouveau compte" onAction={() => router.push('/nouveau-compte')} />

        {(accounts ?? []).length === 0 ? (
          <Card>
            <EmptyState
              icon="wallet-outline"
              title="Aucun compte d’épargne"
              subtitle="Créez un compte (Livret A, LDDS…) avec sa valeur de départ via « Nouveau »."
            />
          </Card>
        ) : (
          (accounts ?? []).map((account) => {
            const ratio = account.target_cents ? account.real_cents / account.target_cents : 0;
            const done = account.target_cents ? ratio >= 1 : false;
            const monthTransfers = transfersByAccount.get(account.id) ?? [];
            return (
              <Card
                key={account.id}
                style={{ gap: spacing.md }}
                onPress={() =>
                  router.push({
                    pathname: '/nouveau-compte',
                    params: {
                      id: String(account.id),
                      name: account.name,
                      icon: account.icon,
                      color: account.color,
                      initial: String(account.initial_cents),
                      ...(account.target_cents ? { target: String(account.target_cents) } : {}),
                      ...(account.monthly_cents ? { monthly: String(account.monthly_cents) } : {}),
                    },
                  })
                }
              >
                <View style={styles.accountRow}>
                  <CategoryIcon icon={account.icon} color={account.color} size={44} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Body weight="semibold" size={15.5}>
                      {account.name}
                    </Body>
                    <Caption>
                      dont {formatCents(account.initial_cents)} de départ
                      {account.monthly_cents ? ` · ${formatCents(account.monthly_cents)}/mois prévu` : ''}
                    </Caption>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 1 }}>
                    <Money cents={account.real_cents} size={17} weight="bold" />
                    {account.target_cents ? (
                      <Caption color={account.color}>
                        {Math.round(ratio * 100)} % · {formatCents(account.target_cents)}
                      </Caption>
                    ) : null}
                  </View>
                </View>

                {account.target_cents ? (
                  <ProgressBar ratio={ratio} color={done ? theme.colors.success : account.color} />
                ) : null}

                {/* Virements du mois : coche « effectué » comme les factures */}
                {monthTransfers.map((t) => {
                  const isDone = t.done === 1;
                  return (
                    <Pressable
                      key={t.id}
                      style={styles.transferRow}
                      onPress={() => toggleDone(t)}
                      onLongPress={() => confirmDeleteTransfer(t)}
                    >
                      <Ionicons
                        name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={isDone ? theme.colors.success : theme.colors.textMuted}
                      />
                      <Caption style={{ flex: 1 }}>
                        Virement du {shortDayLabel(t.date)}
                        {t.note ? ` · ${t.note}` : ''}
                        {isDone ? '' : ' · prévu'}
                      </Caption>
                      <Money
                        cents={t.amount_cents}
                        size={14}
                        signed
                        tone={isDone ? 'success' : 'muted'}
                      />
                    </Pressable>
                  );
                })}

                <Pressable
                  style={[styles.addTransfer, { borderColor: theme.colors.border }]}
                  onPress={() =>
                    router.push({ pathname: '/virement', params: { accountId: String(account.id), month } })
                  }
                >
                  <Ionicons name="add" size={17} color={theme.colors.text} />
                  <Body weight="semibold" size={13.5}>
                    Virement de {monthKeyLabel(month).split(' ')[0]}
                  </Body>
                </Pressable>
              </Card>
            );
          })
        )}

        <Caption style={{ textAlign: 'center' }}>
          Touchez un compte pour le modifier · cochez un virement quand il est fait · appui long pour le
          supprimer
        </Caption>
      </Screen>
      <FAB onPress={() => router.push({ pathname: '/virement', params: { month } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingTop: spacing.xs,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addTransfer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
