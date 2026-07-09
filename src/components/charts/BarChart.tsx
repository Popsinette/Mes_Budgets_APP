import { StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, useTheme } from '@/src/theme';
import { formatCents } from '@/src/utils/money';

export type BarGroup = {
  label: string;
  /** Paires [valeur, couleur] — ex : revenus et dépenses du mois. */
  bars: Array<{ value: number; color: string }>;
};

type BarChartProps = {
  groups: BarGroup[];
  height?: number;
};

/**
 * Histogramme groupé (évolution mensuelle revenus/dépenses).
 * Rendu en pures Views : léger, net à toutes les densités d'écran.
 */
export function BarChart({ groups, height = 140 }: BarChartProps) {
  const theme = useTheme();
  const max = Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.value)));

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[styles.maxLabel, { color: theme.colors.textMuted }]}>{formatCents(max)}</Text>
      <View style={[styles.chart, { height, borderBottomColor: theme.colors.border }]}>
        {groups.map((group, index) => (
          <View key={`${group.label}-${index}`} style={styles.group}>
            <View style={styles.barsRow}>
              {group.bars.map((bar, barIndex) => (
                <View
                  key={barIndex}
                  style={[
                    styles.bar,
                    {
                      height: Math.max(3, (bar.value / max) * height),
                      backgroundColor: bar.value > 0 ? bar.color : theme.colors.cardMuted,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
      <View style={styles.labelsRow}>
        {groups.map((group, index) => (
          <Text
            key={`${group.label}-${index}`}
            style={[styles.label, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {group.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  maxLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  group: {
    flex: 1,
    alignItems: 'center',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  bar: {
    width: 12,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  labelsRow: {
    flexDirection: 'row',
  },
  label: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
});
