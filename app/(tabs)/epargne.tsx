import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { confirmAction } from '@/src/utils/dialogs';
import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ProgressRing } from '@/src/components/charts/ProgressRing';
import { FAB } from '@/src/components/ui/FAB';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteSavingsGoal,
  getTotalSavings,
  listGoalsWithProgress,
} from '@/src/features/savings/repository';
import { spacing, useTheme } from '@/src/theme';
import { monthLabelFromNow } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

export default function SavingsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { data: goals } = useLiveQuery((db) => listGoalsWithProgress(db));
  const { data: totals } = useLiveQuery((db) => getTotalSavings(db));

  const saved = totals?.saved_cents ?? 0;
  const target = totals?.target_cents ?? 0;

  const confirmDelete = (id: number, name: string) => {
    confirmAction({
      title: 'Supprimer l’objectif',
      message: `Supprimer « ${name} » et tout son historique de versements ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => void deleteSavingsGoal(db, id),
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={72}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Plan d’épargne</Text>

        <Card style={{ gap: spacing.md }}>
          <View style={styles.totalRow}>
            <View style={[styles.totalIcon, { backgroundColor: theme.colors.successSoft }]}>
              <Ionicons name="trending-up" size={24} color={theme.colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.totalValue, { color: theme.colors.text }]}>{formatCents(saved)}</Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                {target > 0 ? `sur un objectif total de ${formatCents(target)}` : 'épargnés au total'}
              </Text>
            </View>
          </View>
          {target > 0 ? <ProgressBar ratio={saved / target} color={theme.colors.success} height={10} /> : null}
        </Card>

        <SectionHeader title="Mes objectifs" />

        {(goals ?? []).length === 0 ? (
          <Card>
            <EmptyState
              icon="flag-outline"
              title="Aucun objectif d’épargne"
              subtitle="Créez un objectif (vacances, voiture, fonds d’urgence…) avec le bouton +"
            />
          </Card>
        ) : (
          (goals ?? []).map((goal) => {
            const ratio = goal.target_cents > 0 ? goal.saved_cents / goal.target_cents : 0;
            const done = ratio >= 1;
            const remaining = goal.target_cents - goal.saved_cents;
            const monthsLeft =
              !done && goal.monthly_cents && goal.monthly_cents > 0
                ? Math.ceil(remaining / goal.monthly_cents)
                : null;
            return (
              <Card
                key={goal.id}
                style={{ gap: spacing.md }}
                onPress={() => router.push({ pathname: '/verser', params: { goalId: String(goal.id) } })}
                onLongPress={() => confirmDelete(goal.id, goal.name)}
              >
                <View style={styles.goalRow}>
                  <ProgressRing ratio={ratio} color={done ? theme.colors.success : goal.color}>
                    <Ionicons
                      name={done ? 'checkmark' : (goal.icon as keyof typeof Ionicons.glyphMap)}
                      size={20}
                      color={done ? theme.colors.success : goal.color}
                    />
                  </ProgressRing>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.goalName, { color: theme.colors.text }]}>{goal.name}</Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                      {formatCents(goal.saved_cents)} / {formatCents(goal.target_cents)}
                      {goal.monthly_cents ? ` · ${formatCents(goal.monthly_cents)}/mois` : ''}
                    </Text>
                    {monthsLeft !== null ? (
                      <Text style={{ color: goal.color, fontSize: 12, fontWeight: '600', marginTop: 2 }}>
                        À ce rythme, objectif atteint en {monthLabelFromNow(monthsLeft)}
                      </Text>
                    ) : null}
                  </View>
                  {done ? (
                    <Ionicons name="checkmark-circle" size={26} color={theme.colors.success} />
                  ) : (
                    <Text style={[styles.goalPercent, { color: goal.color }]}>{Math.round(ratio * 100)}%</Text>
                  )}
                </View>
                <ProgressBar ratio={ratio} color={done ? theme.colors.success : goal.color} />
              </Card>
            );
          })
        )}

        <Text style={{ color: theme.colors.textMuted, fontSize: 12, textAlign: 'center' }}>
          Touchez un objectif pour verser dessus · appui long pour le supprimer
        </Text>
      </Screen>
      <FAB onPress={() => router.push('/nouvel-objectif')} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  totalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  goalName: {
    fontSize: 16,
    fontWeight: '700',
  },
  goalPercent: {
    fontSize: 15,
    fontWeight: '800',
  },
});
