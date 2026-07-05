import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { EmptyState } from '@/src/components/ui/EmptyState';
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
import { formatCents } from '@/src/utils/money';

export default function SavingsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { data: goals } = useLiveQuery((db) => listGoalsWithProgress(db));
  const { data: totals } = useLiveQuery((db) => getTotalSavings(db));

  const saved = totals?.saved_cents ?? 0;
  const target = totals?.target_cents ?? 0;

  const confirmDelete = (id: number, name: string) => {
    Alert.alert(
      'Supprimer l’objectif',
      `Supprimer « ${name} » et tout son historique de versements ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => void deleteSavingsGoal(db, id) },
      ],
    );
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
            return (
              <Card
                key={goal.id}
                style={{ gap: spacing.md }}
                onPress={() => router.push({ pathname: '/verser', params: { goalId: String(goal.id) } })}
                onLongPress={() => confirmDelete(goal.id, goal.name)}
              >
                <View style={styles.goalRow}>
                  <CategoryIcon icon={goal.icon} color={goal.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.goalName, { color: theme.colors.text }]}>{goal.name}</Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                      {formatCents(goal.saved_cents)} / {formatCents(goal.target_cents)}
                      {goal.monthly_cents ? ` · ${formatCents(goal.monthly_cents)}/mois prévu` : ''}
                    </Text>
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
