import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '@/src/theme';
import { Heading } from './Text';

/** En-tête d'onglet : menu (réglages) à gauche, titre centré, action optionnelle à droite. */
export function AppHeader({ title, right }: { title: string; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        hitSlop={10}
        onPress={() => router.push('/reglages')}
        accessibilityRole="button"
        accessibilityLabel="Menu et réglages"
        style={styles.side}
      >
        <Ionicons name="menu" size={26} color={theme.colors.text} />
      </Pressable>
      <Heading style={styles.title} numberOfLines={1}>
        {title}
      </Heading>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

/** Petit bouton rond plein (actions d'en-tête). */
export function HeaderIconButton({
  icon,
  label,
  onPress,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      hitSlop={8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconButton, { backgroundColor: color ?? theme.colors.secondary }]}
    >
      <Ionicons name={icon} size={18} color={theme.colors.onAccent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  side: {
    width: 44,
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 19,
    letterSpacing: 0.6,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
