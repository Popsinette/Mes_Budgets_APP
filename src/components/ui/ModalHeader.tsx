import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, useTheme } from '@/src/theme';

export function ModalHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      <Pressable
        hitSlop={8}
        onPress={() => router.back()}
        style={[styles.close, { backgroundColor: theme.colors.cardMuted }]}
      >
        <Ionicons name="close" size={20} color={theme.colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 23,
    letterSpacing: -0.5,
    flex: 1,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
