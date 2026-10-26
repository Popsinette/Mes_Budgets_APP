import { Pressable, StyleSheet, View } from 'react-native';
import type { GoalAdvice, PotWithBalance } from '@/src/features/savings/repository';
import { spacing, useTheme } from '@/src/theme';
import { monthKeyLabel, numericDate } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';
import { Caption } from './ui/Text';

/**
 * Objectif intelligent : ce qu'il faut verser par mois pour tenir la date
 * limite (avec « Ajuster » si le versement programmé ne suffit pas), sinon la
 * date à laquelle l'objectif sera atteint au rythme programmé.
 */
export function GoalHint({
  pot,
  advice,
  onAdjust,
}: {
  pot: PotWithBalance;
  advice: GoalAdvice;
  onAdjust: (cents: number) => void;
}) {
  const theme = useTheme();
  if (!advice.missing_cents) return null;
  if (advice.needed_monthly_cents !== null && advice.on_track === false && pot.deadline) {
    return (
      <View style={styles.hintRow}>
        <Caption tone="warning" style={{ flex: 1 }}>
          Pour le {numericDate(pot.deadline)} : {formatCents(advice.needed_monthly_cents, { compact: true })}/mois
          {pot.monthly_cents ? ` (tu mets ${formatCents(pot.monthly_cents, { compact: true })})` : ''}
        </Caption>
        <Pressable
          onPress={() => onAdjust(advice.needed_monthly_cents!)}
          accessibilityRole="button"
          accessibilityLabel={`Ajuster le versement de ${pot.name} à ${formatCents(advice.needed_monthly_cents)} par mois`}
          hitSlop={6}
          style={({ pressed }) => [styles.adjust, { backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.7 : 1 }]}
        >
          <Caption tone="primary">Ajuster</Caption>
        </Pressable>
      </View>
    );
  }
  if (advice.reach_month) {
    const label = monthKeyLabel(advice.reach_month);
    return (
      <Caption tone="success">
        {advice.on_track ? 'En bonne voie · ' : ''}atteint en {label} au rythme actuel
      </Caption>
    );
  }
  if (advice.needed_monthly_cents) {
    return <Caption tone="warning">Pour y arriver : {formatCents(advice.needed_monthly_cents, { compact: true })}/mois</Caption>;
  }
  return null;
}


const styles = StyleSheet.create({
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  adjust: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 999 },
});
