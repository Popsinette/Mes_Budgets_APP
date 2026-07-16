import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { fonts, radius, spacing, useTheme } from '@/src/theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ label, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  const theme = useTheme();
  const background =
    variant === 'primary'
      ? theme.colors.primary
      : variant === 'danger'
        ? theme.colors.dangerSoft
        : theme.colors.cardMuted;
  const color =
    variant === 'primary'
      ? theme.colors.onPrimary
      : variant === 'danger'
        ? theme.colors.danger
        : theme.colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered ?? false;
        return [
          styles.button,
          {
            backgroundColor: background,
            opacity: disabled ? 0.4 : state.pressed ? 0.85 : hovered ? 0.92 : 1,
          },
        ];
      }}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.label, { color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.bodySemibold,
    fontSize: 15.5,
    letterSpacing: 0.2,
  },
});
