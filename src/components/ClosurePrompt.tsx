import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Card } from '@/src/components/ui/Card';
import { Body, Caption } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getClosurePrompt } from '@/src/features/closure/repository';
import { spacing, useTheme } from '@/src/theme';
import { monthKeyLabel } from '@/src/utils/dates';

/** Rappel « Septembre est fini : clôture-le » (mois précédent pas encore clôturé). */
export function ClosurePrompt() {
  const theme = useTheme();
  const { data } = useLiveQuery((db) => getClosurePrompt(db), []);
  if (!data) return null;
  const name = monthKeyLabel(data.month).split(' ')[0];
  const label = `${name.charAt(0).toUpperCase()}${name.slice(1)} est fini`;
  return (
    <Card
      onPress={() => router.push({ pathname: '/cloture', params: { month: data.month } })}
      style={[styles.card, { borderColor: theme.colors.primary }]}
    >
      <Ionicons name="archive-outline" size={22} color={theme.colors.primary} />
      <View style={{ flex: 1 }}>
        <Body weight="semibold">{label} : clôture-le</Body>
        <Caption>
          {data.pending === 1 ? '1 enveloppe a' : `${data.pending} enveloppes ont`} un reste ou un dépassement à
          ranger.
        </Caption>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1.5 },
});
