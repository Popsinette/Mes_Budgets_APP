import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '@/src/theme';
import { monthGrid, monthKeyLabel, shiftMonthKey, todayIso } from '@/src/utils/dates';
import { Body, Caption, Eyebrow } from './Text';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Petit calendrier (lundi → dimanche) pour choisir une date ISO. */
export function DatePickerGrid({ value, onChange, label = 'Date' }: { value: string; onChange: (iso: string) => void; label?: string }) {
  const theme = useTheme();
  const month = value.slice(0, 7);
  const today = todayIso();
  const cells = monthGrid(month);
  const title = monthKeyLabel(month);
  const shift = (offset: number) => {
    const target = shiftMonthKey(month, offset);
    const day = Math.min(Number(value.slice(8, 10)), 28);
    onChange(`${target}-${String(day).padStart(2, '0')}`);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Eyebrow>{label}</Eyebrow>
      <View style={[styles.box, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <View style={styles.head}>
          <Pressable hitSlop={10} onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="Mois précédent">
            <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
          </Pressable>
          <Body weight="semibold">{title.charAt(0).toUpperCase() + title.slice(1)}</Body>
          <Pressable hitSlop={10} onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="Mois suivant">
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
          </Pressable>
        </View>
        <View style={styles.grid}>
          {WEEKDAYS.map((d, i) => (
            <View key={`h${i}`} style={styles.cell}>
              <Caption>{d}</Caption>
            </View>
          ))}
          {cells.map((iso, i) =>
            iso ? (
              <Pressable
                key={iso}
                onPress={() => onChange(iso)}
                accessibilityRole="button"
                accessibilityState={{ selected: iso === value }}
                accessibilityLabel={iso}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    iso === value && { backgroundColor: theme.colors.primary },
                    iso !== value && iso === today && { borderWidth: 1, borderColor: theme.colors.primary },
                  ]}
                >
                  <Body size={14} weight={iso === value ? 'bold' : 'regular'} color={iso === value ? theme.colors.onPrimary : undefined}>
                    {Number(iso.slice(8, 10))}
                  </Body>
                </View>
              </Pressable>
            ) : (
              <View key={`e${i}`} style={styles.cell} />
            ),
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 2,
  },
  day: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
