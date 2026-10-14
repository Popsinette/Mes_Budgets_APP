import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getMonthSummary } from '@/src/features/summary/repository';
import { spacing, useTheme } from '@/src/theme';
import type { MonthKey } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';
import { Body } from './ui/Text';

/**
 * Pastille du reste prévisionnel du mois : verte si le plan tient, rouge dès
 * qu'une dépense (ou le plan lui-même) fait passer sous zéro. Toujours avec
 * icône + texte, jamais la couleur seule. Toucher → Synthèse (détail du plan).
 */
export function ForecastPill({ month }: { month: MonthKey }) {
  const theme = useTheme();
  const { data } = useLiveQuery((db) => getMonthSummary(db, month), [month]);
  if (!data) return null;
  const left = data.forecast_left_cents;
  const red = left < 0;
  const color = red ? theme.colors.danger : theme.colors.success;
  const label = red
    ? `Dans le rouge : ${formatCents(left)}`
    : `Prévisionnel : ${formatCents(left, { signed: left !== 0 })}`;
  return (
    <Pressable
      onPress={() => router.navigate('/synthese')}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Voir mon plan du mois`}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: red ? theme.colors.dangerSoft : theme.colors.successSoft, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Ionicons name={red ? 'alert-circle' : 'checkmark-circle'} size={16} color={color} />
      <Body size={13} weight="semibold" color={color}>
        {label}
      </Body>
      <Ionicons name="chevron-forward" size={13} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
  },
});
