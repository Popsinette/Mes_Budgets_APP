import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { deleteHabit, HABIT_FREQUENCY_LABELS, listHabits, type Habit } from '@/src/features/habits/repository';
import { spacing, useTheme } from '@/src/theme';
import { numericDate } from '@/src/utils/dates';
import { confirmAction } from '@/src/utils/dialogs';

/** « Mes habitudes » : les dépenses qui reviennent (hors factures), proposées à chaque échéance. */
export default function HabitsModal() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { data } = useLiveQuery((db) => listHabits(db), []);
  const habits = data ?? [];

  const remove = (h: Habit) =>
    confirmAction({
      title: 'Arrêter cette habitude',
      message: `« ${h.label} » ne sera plus proposée. Les dépenses déjà notées restent.`,
      confirmLabel: 'Arrêter',
      destructive: true,
      onConfirm: () => void deleteHabit(db, h.id),
    });

  return (
    <Screen>
      <ModalHeader title="Mes habitudes" />
      <Caption>
        Cantine chaque lundi, essence toutes les deux semaines, coiffeur chaque mois… Ce ne sont pas des factures : à
        chaque échéance, l’app te les propose dans Variables (« À noter »), tu les notes ou les ignores d’un toucher.
      </Caption>
      {habits.length === 0 ? (
        <Card>
          <EmptyState
            icon="repeat-outline"
            title="Aucune habitude"
            subtitle="En notant une dépense, choisis « Revient régulièrement ? » pour en faire une habitude."
          />
        </Card>
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {habits.map((h, i) => (
            <View key={h.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.hairline }]}>
              <View style={{ flex: 1 }}>
                <Body weight="semibold" numberOfLines={1}>
                  {h.label}
                </Body>
                <Caption numberOfLines={1}>
                  {HABIT_FREQUENCY_LABELS[h.frequency]} · {h.envelope_name} · depuis le {numericDate(h.start_date)}
                </Caption>
              </View>
              <Money cents={h.amount_cents} size={15} weight="semibold" />
              <Pressable onPress={() => remove(h)} accessibilityRole="button" accessibilityLabel={`Arrêter ${h.label}`} hitSlop={8}>
                <Ionicons name="trash-outline" size={19} color={theme.colors.danger} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}
      <Button label="Noter une dépense" variant="secondary" onPress={() => router.push('/depense')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
});
