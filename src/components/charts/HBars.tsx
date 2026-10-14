import { StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '@/src/theme';
import { Body, Caption, Money } from '../ui/Text';

export type BarItem = { key: string; label: string; cents: number; color: string };

/**
 * Répartition en barres horizontales : une ligne par entrée, pastille et barre
 * à la couleur de l'entité, libellé et montant en encre, part en %.
 */
export function HBars({ items }: { items: BarItem[] }) {
  const theme = useTheme();
  const total = items.reduce((s, i) => s + Math.max(0, i.cents), 0);
  const max = Math.max(1, ...items.map((i) => i.cents));
  return (
    <View style={{ gap: spacing.md }}>
      {items.map((item) => (
        <View key={item.key} style={{ gap: 6 }} accessibilityLabel={`${item.label} : ${item.cents / 100} euros`}>
          <View style={styles.labelRow}>
            <View style={[styles.swatch, { backgroundColor: item.color }]} />
            <Body size={14} weight="medium" style={{ flex: 1 }} numberOfLines={1}>
              {item.label}
            </Body>
            <Money cents={item.cents} size={14} />
            <Caption style={styles.pct}>{total > 0 ? Math.round((Math.max(0, item.cents) / total) * 100) : 0} %</Caption>
          </View>
          <View style={[styles.track, { backgroundColor: theme.colors.cardMuted }]}>
            <View
              style={[
                styles.fill,
                { backgroundColor: item.color, width: `${(Math.max(0, item.cents) / max) * 100}%` },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  pct: {
    width: 38,
    textAlign: 'right',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
