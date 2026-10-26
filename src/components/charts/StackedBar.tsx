import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '@/src/theme';
import { formatCents } from '@/src/utils/money';
import { Body, Caption, Money } from '../ui/Text';

export type StackItem = { key: string; label: string; cents: number; color: string | null; hint?: string };

/**
 * Part du tout en une barre horizontale : segments séparés de 2 px, bouts
 * arrondis, puis la légende-tableau (pastille, libellé, montant, %) — les
 * montants restent lisibles sans la couleur. Toucher une ligne met son
 * segment en avant. Une entrée sans couleur (« Reste ») prend le gris neutre.
 */
export function StackedBar({ items, total }: { items: StackItem[]; total?: number }) {
  const theme = useTheme();
  const [focus, setFocus] = useState<string | null>(null);
  const shown = items.filter((i) => i.cents > 0);
  const sum = total ?? shown.reduce((s, i) => s + i.cents, 0);
  const neutral = theme.dark ? '#4A4A60' : '#D9D6E6';
  const colorOf = (i: StackItem) => (i.color ? theme.tint(i.color) : neutral);

  return (
    <View style={{ gap: spacing.md }}>
      <View
        style={[styles.bar, { backgroundColor: theme.colors.cardMuted }]}
        accessibilityRole="image"
        accessibilityLabel={shown.map((i) => `${i.label} ${formatCents(i.cents)}`).join(', ')}
      >
        {shown.map((item, idx) => (
          <View
            key={item.key}
            style={{
              flex: item.cents,
              backgroundColor: colorOf(item),
              marginLeft: idx === 0 ? 0 : 2,
              borderTopLeftRadius: idx === 0 ? 6 : 0,
              borderBottomLeftRadius: idx === 0 ? 6 : 0,
              borderTopRightRadius: idx === shown.length - 1 ? 6 : 0,
              borderBottomRightRadius: idx === shown.length - 1 ? 6 : 0,
              opacity: focus && focus !== item.key ? 0.3 : 1,
            }}
          />
        ))}
      </View>
      <View>
        {items.filter((i) => i.cents > 0).map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setFocus(focus === item.key ? null : item.key)}
            accessibilityRole="button"
            accessibilityLabel={`${item.label} : ${formatCents(item.cents)}`}
            style={[styles.row, { opacity: focus && focus !== item.key ? 0.45 : 1 }]}
          >
            <View style={[styles.swatch, { backgroundColor: colorOf(item) }]} />
            <View style={{ flex: 1 }}>
              <Body size={14} weight="medium" numberOfLines={1}>
                {item.label}
              </Body>
              {item.hint ? <Caption numberOfLines={1}>{item.hint}</Caption> : null}
            </View>
            <Money cents={item.cents} size={14} weight="semibold" />
            <Caption style={styles.pct}>{sum > 0 ? Math.round((item.cents / sum) * 100) : 0} %</Caption>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 22,
    borderRadius: 6,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 7,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 4,
  },
  pct: {
    width: 40,
    textAlign: 'right',
  },
});
