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
    return <View style={[containerStyle, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView
      style={containerStyle}
      contentContainerStyle={contentStyle}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
});
