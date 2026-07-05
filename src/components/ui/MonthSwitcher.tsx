import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, useTheme } from '@/src/theme';
import { monthKeyLabel, shiftMonthKey, type MonthKey } from '@/src/utils/dates';

type MonthSwitcherProps = {
  month: MonthKey;
  onChange: (month: MonthKey) => void;
};

/** Navigation ‹ juillet 2026 › entre les mois. */
export function MonthSwitcher({ month, onChange }: MonthSwitcherProps) {
  const theme = useTheme();
  const label = monthKeyLabel(month);

  return (
    <View style={[styles.row, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <Pressable hitSlop={10} onPress={() => onChange(shiftMonthKey(month, -1))}>
        <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
      </Pressable>
      <Text style={[styles.label, { color: theme.colors.text }]}>
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </Text>
      <Pressable hitSlop={10} onPress={() => onChange(shiftMonthKey(month, 1))}>
        <Ionicons name="chevron-forward" size={22} color={theme.colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
});
