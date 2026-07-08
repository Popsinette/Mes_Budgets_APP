import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
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
      <Screen bottomInset={72}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Épargne</Text>

        <LinearGradient
          colors={theme.dark ? ['#0E7A5F', '#12A67E'] : ['#10B981', '#34D399']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.globalCard}
        >
          <View style={styles.globalTop}>
            <View style={styles.globalIcon}>
              <Ionicons name="trending-up" size={22} color="#FFFFFF" />
            </View>
            <Text style={styles.globalLabel}>Épargne totale</Text>
          </View>
          <Text style={styles.globalValue}>{formatCents(totalReal)}</Text>
          {totalPlanned > totalReal ? (
            <Text style={styles.globalSub}>
              {formatCents(totalPlanned)} avec les virements prévus
            </Text>
          ) : (
            <Text style={styles.globalSub}>Somme de tous vos comptes</Text>
          )}
        </LinearGradient>

        <MonthSwitcher month={month} onChange={setMonth} />

        <SectionHeader title="Mes comptes" actionLabel="Nouveau" onAction={() => router.push('/nouveau-compte')} />

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
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.accountName, { color: theme.colors.text }]}>{account.name}</Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                      dont {formatCents(account.initial_cents)} de départ
                      {account.monthly_cents ? ` · ${formatCents(account.monthly_cents)}/mois prévu` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.accountBalance, { color: theme.colors.text }]}>
                      {formatCents(account.real_cents)}
                    </Text>
                    {account.target_cents ? (
                      <Text style={{ color: account.color, fontSize: 12, fontWeight: '700' }}>
                        {Math.round(ratio * 100)} % · {formatCents(account.target_cents)}
                      </Text>
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
                      <Text style={{ flex: 1, color: theme.colors.textMuted, fontSize: 13 }}>
                        Virement du {shortDayLabel(t.date)}
                        {t.note ? ` · ${t.note}` : ''}
                        {isDone ? '' : ' · prévu'}
                      </Text>
                      <Text
                        style={{
                          color: isDone ? theme.colors.success : theme.colors.textMuted,
                          fontWeight: '700',
                          fontSize: 14,
                        }}
                      >
                        +{formatCents(t.amount_cents)}
                      </Text>
                    </Pressable>
                  );
                })}

                <Pressable
                  style={[styles.addTransfer, { borderColor: theme.colors.border }]}
                  onPress={() =>
                    router.push({ pathname: '/virement', params: { accountId: String(account.id), month } })
                  }
                >
                  <Ionicons name="add" size={18} color={account.color} />
                  <Text style={{ color: account.color, fontWeight: '700', fontSize: 14 }}>
                    Virement de {monthKeyLabel(month).split(' ')[0]}
                  </Text>
                </Pressable>
              </Card>
            );
          })
        )}

        <Text style={{ color: theme.colors.textMuted, fontSize: 12, textAlign: 'center' }}>
          Touchez un compte pour le modifier · cochez un virement quand il est fait · appui long pour le
          supprimer
        </Text>
      </Screen>
      <FAB onPress={() => router.push({ pathname: '/virement', params: { month } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  globalCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  globalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  globalIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  globalLabel: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    fontWeight: '700',
  },
  globalValue: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
  },
  globalSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '700',
  },
  accountBalance: {
    fontSize: 17,
    fontWeight: '800',
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
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
});
