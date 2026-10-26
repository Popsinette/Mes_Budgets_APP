import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { listDueHabits, recordHabit, skipHabit, type DueHabit } from '@/src/features/habits/repository';
import { spacing, useTheme } from '@/src/theme';
import { shortDayLabel, todayIso } from '@/src/utils/dates';
import { notify } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';
import { Card } from './ui/Card';
import { Body, Caption } from './ui/Text';

/** « À noter » : les habitudes arrivées à échéance, à noter ou ignorer d'un toucher. */
export function HabitsDue() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { data } = useLiveQuery((db) => listDueHabits(db, todayIso()), []);
  if (!data || data.length === 0) return null;

  const record = async (h: DueHabit) => {
    try {
      await recordHabit(db, h);
    } catch (error) {
      notify('Impossible de la noter', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Card style={{ gap: spacing.xs, paddingVertical: spacing.md }}>
      <View style={styles.head}>
        <Body weight="semibold" style={{ flex: 1 }}>
          À noter · {data.length === 1 ? '1 habitude' : `${data.length} habitudes`}
        </Body>
        <Pressable onPress={() => router.push('/habitudes')} accessibilityRole="button" hitSlop={8}>
          <Caption tone="primary">Gérer</Caption>
        </Pressable>
      </View>
      {data.slice(0, 5).map((h) => (
        <View key={`${h.id}-${h.due_date}`} style={[styles.row, { borderTopColor: theme.colors.hairline }]}>
          <View style={{ flex: 1 }}>
            <Body size={14} weight="medium" numberOfLines={1}>
              {h.label}
            </Body>
            <Caption numberOfLines={1}>
              {shortDayLabel(h.due_date)} · {h.envelope_name}
            </Caption>
          </View>
          <Body size={14} weight="semibold">
            {formatCents(h.amount_cents)}
          </Body>
          <Pressable
            onPress={() => void skipHabit(db, h.id, h.due_date)}
            accessibilityRole="button"
            accessibilityLabel={`Ignorer ${h.label} du ${shortDayLabel(h.due_date)}`}
            hitSlop={6}
            style={({ pressed }) => [styles.skip, { borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <Caption>Ignorer</Caption>
          </Pressable>
          <Pressable
            onPress={() => void record(h)}
            accessibilityRole="button"
            accessibilityLabel={`Noter ${h.label} du ${shortDayLabel(h.due_date)}`}
            hitSlop={6}
            style={({ pressed }) => [styles.add, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }]}
          >
            <Caption color={theme.colors.onPrimary}>Noter</Caption>
          </Pressable>
        </View>
      ))}
      {data.length > 5 ? <Caption>… et {data.length - 5} autres.</Caption> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1 },
  skip: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  add: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999 },
});
