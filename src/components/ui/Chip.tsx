import { Pressable, StyleSheet, Text } from 'react-native';
import { fonts, radius, spacing, useTheme } from '@/src/theme';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
};

export function Chip({ label, selected, onPress, color }: ChipProps) {
  const theme = useTheme();
  const accent = color ?? theme.colors.primary;
  const textColor = selected ? (color ? '#FFFFFF' : theme.colors.onAccent) : theme.colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected) }}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered ?? false;
        return [
          styles.chip,
          {
            backgroundColor: selected ? accent : 'transparent',
            borderColor: selected ? accent : hovered ? theme.colors.textMuted : theme.colors.border,
            opacity: state.pressed ? 0.7 : 1,
          },
        ];
      }}
    >
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  label: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13.5,
  },
});
