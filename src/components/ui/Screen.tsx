import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, useTheme } from '@/src/theme';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  style?: ViewStyle;
  /** Marge basse supplémentaire (ex : pour laisser la place au FAB). */
  bottomInset?: number;
}>;

/**
 * Conteneur d'écran. Mobile first : pleine largeur sur téléphone ; sur
 * tablette/desktop le contenu se recentre dans une colonne de lecture
 * (max 560 px) pour que la PWA reste élégante à toutes les tailles.
 */
export function Screen({ children, scroll = true, style, bottomInset = 0 }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const containerStyle = [styles.container, { backgroundColor: theme.colors.background }];
  const contentStyle = [
    styles.content,
    { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl + bottomInset },
    style,
  ];

  if (!scroll) {
    return (
      <View style={containerStyle}>
        <View style={[styles.column, contentStyle]}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView
      style={containerStyle}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.column, contentStyle]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
});
