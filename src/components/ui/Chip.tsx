import { Pressable, StyleSheet, Text } from 'react-native';
import { radius, spacing, useTheme } from '@/src/theme';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
};

export function Chip({ label, selected, onPress, color }: ChipProps) {
  const theme = useTheme();
  const accent = color ?? theme.colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? accent : theme.colors.cardMuted,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: selected ? '#FFFFFF' : theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});
