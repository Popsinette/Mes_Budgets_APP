import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '@/src/theme';
import { monthKeyLabel, shiftMonthKey, type MonthKey } from '@/src/utils/dates';
import { Caption, Heading } from './Text';

type MonthSwitcherProps = {
  month: MonthKey;
  onChange: (month: MonthKey) => void;
  /** Ligne sous le mois (ex. « Semaine 3/4 »). */
  subtitle?: string;
};

/** Navigation ← Septembre 2026 → entre les mois. */
export function MonthSwitcher({ month, onChange, subtitle }: MonthSwitcherProps) {
  const theme = useTheme();
  const label = monthKeyLabel(month);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          hitSlop={12}
          onPress={() => onChange(shiftMonthKey(month, -1))}
          accessibilityRole="button"
          accessibilityLabel="Mois précédent"
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Heading style={styles.label}>{label.charAt(0).toUpperCase() + label.slice(1)}</Heading>
        <Pressable
          hitSlop={12}
          onPress={() => onChange(shiftMonthKey(month, 1))}
          accessibilityRole="button"
          accessibilityLabel="Mois suivant"
        >
          <Ionicons name="arrow-forward" size={24} color={theme.colors.text} />
        </Pressable>
      </View>
      {subtitle ? <Caption style={styles.subtitle}>{subtitle}</Caption> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  label: {
    fontSize: 21,
    letterSpacing: 0.8,
    minWidth: 190,
    textAlign: 'center',
  },
  subtitle: {
    fontStyle: 'italic',
    fontSize: 13.5,
  },
});
