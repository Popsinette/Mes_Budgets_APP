import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, useTheme } from '@/src/theme';
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
    <View style={[styles.row, { borderColor: theme.colors.border }]}>
      <Pressable
        hitSlop={10}
        onPress={() => onChange(shiftMonthKey(month, -1))}
        style={[styles.arrow, { backgroundColor: theme.colors.cardMuted }]}
      >
        <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
      </Pressable>
      <Text style={[styles.label, { color: theme.colors.text }]}>
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </Text>
      <Pressable
        hitSlop={10}
        onPress={() => onChange(shiftMonthKey(month, 1))}
        style={[styles.arrow, { backgroundColor: theme.colors.cardMuted }]}
      >
        <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.displaySemibold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
});
