import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, useTheme } from '@/src/theme';

type SectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Sur-titre de section en capitales espacées — repère éditorial discret. */
export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: theme.colors.textMuted }]}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[styles.action, { color: theme.colors.text }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  action: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
  },
});
