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
  // Pastel : sélectionnée = fond teinté doux + bord de la couleur, texte en encre.
  const accent = color ? theme.tint(color) : theme.colors.primary;
  const soft = color ? `${accent}${theme.dark ? '33' : '22'}` : theme.colors.primarySoft;
  const textColor = selected ? (color ? theme.colors.text : theme.colors.primary) : theme.colors.textMuted;

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
            backgroundColor: selected ? soft : theme.colors.card,
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
