import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';
import { GoalHint } from '@/src/components/GoalHint';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteMove,
  listMoves,
  listPots,
  goalAdvice,
  setPlanDone,
  setPlanSkipped,
  setPotMonthly,
  POT_KIND_LABELS,
  type SavingsMove,
} from '@/src/features/savings/repository';
import { spacing, useTheme } from '@/src/theme';
import { useSelectedMonth } from '@/src/store/month';
import { currentMonthKey, isoDayInMonth, monthKeyLabel, shortDayLabel, todayIso } from '@/src/utils/dates';
import { confirmAction } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

export default function PotDetailModal() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const month = useSelectedMonth((s) => s.month);
  const { data: pot } = useLiveQuery(async (db) => (await listPots(db, month)).find((p) => p.id === id) ?? null, [id, month]);
  const { data: moves } = useLiveQuery((db) => listMoves(db, id), [id]);

  if (!pot) return <Screen />;
  const ratio = pot.target_cents ? pot.balance_cents / pot.target_cents : 0;

  const confirmDelete = (move: SavingsMove) => {
    confirmAction({
      title: 'Supprimer le mouvement',
      message: `Supprimer ce ${move.amount_cents < 0 ? 'retrait' : 'dépôt'} de ${formatCents(Math.abs(move.amount_cents))} ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => void deleteMove(db, move),
    });
  };

  const openMove = (type: 'deposit' | 'withdraw') =>
    router.push({ pathname: '/mouvement', params: { potId: String(pot.id), type } });

  return (
    <Screen>
      <ModalHeader title={pot.name} />

      <View style={styles.hero}>
        <CategoryIcon icon={pot.icon} color={pot.color} size={52} />
        <View style={{ flex: 1 }}>
          <Eyebrow>{POT_KIND_LABELS[pot.kind]}</Eyebrow>
          <Money cents={pot.balance_cents} size={36} weight="xbold" />
          <Pressable
            onPress={() => router.push({ pathname: '/poche', params: { id: String(pot.id) } })}
            accessibilityRole="button"
            accessibilityLabel="Corriger le montant"
            hitSlop={8}
          >
            <Caption tone="primary">Corriger le montant</Caption>
          </Pressable>
        </View>
      </View>

      {pot.target_cents ? (
        <View style={{ gap: spacing.sm }}>
          <GoalHint pot={pot} advice={goalAdvice(pot, month)} onAdjust={(cents) => void setPotMonthly(db, pot.id, cents)} />
          <ProgressBar ratio={ratio} color={ratio >= 1 ? theme.colors.success : pot.color} height={11} />
          <Caption>
            {ratio >= 1
              ? `Objectif de ${formatCents(pot.target_cents)} atteint 🎉`
              : `${Math.round(ratio * 100)} % · encore ${formatCents(pot.target_cents - pot.balance_cents)} pour atteindre ${formatCents(pot.target_cents)}`}
          </Caption>
        </View>
      ) : null}

      {pot.monthly_cents ? (
        <Card style={{ gap: spacing.sm }}>
          <View style={styles.hero}>
            <View style={{ flex: 1 }}>
              <Eyebrow>Versement de {monthKeyLabel(month)}</Eyebrow>
              <Caption>
                {pot.plan_skipped === 1
                  ? 'Pas ce mois-ci : rien à mettre de côté ce mois-là.'
                  : pot.plan_done === 1
                    ? 'Versé ✓'
                    : 'À verser'}
              </Caption>
            </View>
            <Money cents={pot.plan_skipped === 1 ? 0 : pot.monthly_cents} size={20} weight="bold" />
          </View>
          <View style={styles.buttons}>
            {pot.plan_skipped === 1 ? null : (
              <View style={{ flex: 1 }}>
                <Button
                  label={pot.plan_done === 1 ? 'Annuler le versement' : 'Marquer versé'}
                  variant={pot.plan_done === 1 ? 'secondary' : 'primary'}
                  onPress={() =>
                    void setPlanDone(
                      db,
                      pot,
                      month,
                      pot.plan_done !== 1,
                      month === currentMonthKey() ? todayIso() : isoDayInMonth(month, 1),
                    )
                  }
                />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Button
                label={pot.plan_skipped === 1 ? 'Reprendre ce mois-ci' : 'Pas ce mois-ci'}
                variant="secondary"
                onPress={() => void setPlanSkipped(db, pot.id, month, pot.plan_skipped !== 1)}
              />
            </View>
          </View>
        </Card>
      ) : null}

      <View style={styles.buttons}>
        <View style={{ flex: 1 }}>
          <Button label="Ajouter" onPress={() => openMove('deposit')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Retirer" variant="secondary" onPress={() => openMove('withdraw')} />
        </View>
      </View>
      <Button
        label="Modifier la cagnotte"
        variant="secondary"
        onPress={() => router.push({ pathname: '/poche', params: { id: String(pot.id) } })}
      />

      <SectionHeader title="Historique" />
      {(moves ?? []).length === 0 && pot.initial_cents === 0 ? (
        <Card>
          <EmptyState icon="time-outline" title="Aucun mouvement" subtitle="Tes dépôts et retraits apparaîtront ici." />
        </Card>
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {(moves ?? []).map((move) => (
            <Pressable
              key={move.id}
              onLongPress={() => confirmDelete(move)}
              style={({ pressed }) => [styles.moveRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <View style={{ flex: 1 }}>
                <Body weight="medium">{move.note || (move.amount_cents < 0 ? 'Retrait' : 'Dépôt')}</Body>
                <Caption>{shortDayLabel(move.date)}</Caption>
              </View>
              <Money cents={move.amount_cents} signed size={15} tone={move.amount_cents < 0 ? 'expense' : 'income'} />
            </Pressable>
          ))}
          {pot.initial_cents !== 0 ? (
            <View style={styles.moveRow}>
              <Body weight="medium" style={{ flex: 1 }}>
                Déjà épargné au départ
              </Body>
              <Money cents={pot.initial_cents} size={15} tone="muted" />
            </View>
          ) : null}
        </Card>
      )}
      {(moves ?? []).length > 0 ? (
        <Caption style={{ textAlign: 'center' }}>Appui long sur un mouvement pour le supprimer</Caption>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
});
