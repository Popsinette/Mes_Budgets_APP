import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, monthKeyLabel, shiftMonthKey, type MonthKey } from '@/src/utils/dates';
import { Caption, Heading } from './Text';

type MonthSwitcherProps = {
  month: MonthKey;
  onChange: (month: MonthKey) => void;
  /** Ligne sous le mois (ex. « Semaine 3/4 »). */
  subtitle?: string;
};

/** Navigation ‹ Septembre 2026 › entre les mois, avec retour d'un toucher au mois en cours. */
export function MonthSwitcher({ month, onChange, subtitle }: MonthSwitcherProps) {
  const theme = useTheme();
  const label = monthKeyLabel(month);
  const current = currentMonthKey();
  const arrow = (direction: -1 | 1) => (
    <Pressable
      hitSlop={10}
      onPress={() => onChange(shiftMonthKey(month, direction))}
      accessibilityRole="button"
      accessibilityLabel={direction < 0 ? 'Mois précédent' : 'Mois suivant'}
      style={({ pressed }) => [styles.arrow, { backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={direction < 0 ? 'chevron-back' : 'chevron-forward'} size={20} color={theme.colors.primary} />
    </Pressable>
  );
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.row,
          { backgroundColor: theme.colors.card, borderColor: theme.dark ? theme.colors.border : 'transparent' },
        ]}
      >
        {arrow(-1)}
        <View style={styles.center}>
          <Heading style={styles.label} numberOfLines={1}>
            {label.charAt(0).toUpperCase() + label.slice(1)}
          </Heading>
          {subtitle ? <Caption style={styles.subtitle}>{subtitle}</Caption> : null}
        </View>
        {arrow(1)}
      </View>
      {month !== current ? (
        <Pressable
          onPress={() => onChange(current)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Revenir au mois en cours"
          style={({ pressed }) => [styles.today, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="return-down-back" size={14} color={theme.colors.primary} />
          <Caption tone="primary">Revenir à {monthKeyLabel(current).split(' ')[0]}</Caption>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm },
  row: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center' },
  label: { fontSize: 18, letterSpacing: 0.2, textAlign: 'center' },
  subtitle: { fontSize: 12.5 },
  today: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
