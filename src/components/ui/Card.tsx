import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, useTheme } from '@/src/theme';

type CardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
}>;

/** Carte douce : fond blanc, sans bord en clair, ombre lavande à peine visible, grands coins arrondis. */
export function Card({ children, style, onPress, onLongPress }: CardProps) {
  const theme = useTheme();
  const interactive = Boolean(onPress || onLongPress);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!interactive}
      style={(state) => {
        const pressed = state.pressed;
        // Survol (web uniquement) : la carte se signale d'une ombre à peine plus présente.
        const hovered = interactive && ((state as { hovered?: boolean }).hovered ?? false);
        return [
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.dark ? theme.colors.border : 'transparent',
            shadowColor: theme.dark ? '#000000' : '#5B4FC4',
            opacity: pressed && interactive ? 0.75 : 1,
            shadowOpacity: theme.dark ? 0.2 : hovered ? 0.12 : 0.06,
            transform: [{ translateY: hovered && !pressed ? -1 : 0 }],
          },
          style,
        ];
      }}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
});
