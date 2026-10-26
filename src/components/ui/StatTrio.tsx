import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '@/src/theme';
import { Card } from './Card';
import { ProgressBar } from './ProgressBar';
import { Caption, Money } from './Text';

export type Stat = {
  label: string;
  cents: number;
  icon: keyof typeof Ionicons.glyphMap;
  /** Couleur de la pastille (vert ardoise, vieux rose, bleu nuit…). */
  color: string;
  /** Montant mis en avant (ex. « À débiter ») : teinte d'accent sur le chiffre. */
  accent?: string;
};

/**
 * Bloc de suivi à trois colonnes (Total · Réglé · À débiter), avec une jauge
 * optionnelle et sa légende (« 73 % réglé »).
 */
export function StatTrio({ stats, ratio, ratioLabel }: { stats: Stat[]; ratio?: number; ratioLabel?: string }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.row}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.col}>
            <View style={[styles.dot, { backgroundColor: `${stat.color}${theme.dark ? '33' : '22'}` }]}>
              <Ionicons name={stat.icon} size={21} color={stat.color} />
            </View>
            <Caption tone="text" style={{ fontSize: 13 }}>
              {stat.label}
            </Caption>
            <Money cents={stat.cents} size={15.5} weight="bold" color={stat.accent} />
          </View>
        ))}
      </View>
      {ratio != null ? (
        <View style={styles.ratioRow}>
          <View style={{ flex: 1 }}>
            <ProgressBar ratio={ratio} color={theme.colors.secondary} height={8} />
          </View>
          {ratioLabel ? <Caption style={{ fontStyle: 'italic' }}>{ratioLabel}</Caption> : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  col: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  ratioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
