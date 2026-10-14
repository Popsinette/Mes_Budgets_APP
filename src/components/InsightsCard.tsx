import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getInsights, type InsightTone } from '@/src/features/insights/repository';
import { spacing, useTheme, type Theme } from '@/src/theme';
import type { MonthKey } from '@/src/utils/dates';
import { Card } from './ui/Card';
import { Body, Caption, Heading } from './ui/Text';

function toneColors(theme: Theme, tone: InsightTone): { fg: string; bg: string } {
  switch (tone) {
    case 'danger':
      return { fg: theme.colors.danger, bg: theme.colors.dangerSoft };
    case 'warning':
      return { fg: theme.colors.warning, bg: theme.colors.warningSoft };
    case 'success':
      return { fg: theme.colors.success, bg: theme.colors.successSoft };
    default:
      return { fg: theme.colors.navy, bg: theme.colors.cardMuted };
  }
}

/** « Constats clés » : 5 phrases au plus, des alertes aux simples infos. Icône + texte, jamais la couleur seule. */
export function InsightsCard({ month }: { month: MonthKey }) {
  const theme = useTheme();
  const { data: insights } = useLiveQuery((db) => getInsights(db, month), [month]);
  if (!insights) return null;

  return (
    <Card style={{ gap: spacing.md }}>
      <Heading>Constats clés</Heading>
      {insights.length === 0 ? (
        <Caption>Ajoute tes revenus, charges et dépenses : les constats du mois apparaîtront ici.</Caption>
      ) : (
        insights.map((insight) => {
          const { fg, bg } = toneColors(theme, insight.tone);
          const name = (insight.icon in Ionicons.glyphMap ? insight.icon : 'information-circle-outline') as keyof typeof Ionicons.glyphMap;
          return (
            <View key={insight.key} style={styles.row} accessible accessibilityLabel={`${insight.title}. ${insight.detail}`}>
              <View style={[styles.icon, { backgroundColor: bg }]}>
                <Ionicons name={name} size={18} color={fg} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Body size={14.5} weight="semibold">
                  {insight.title}
                </Body>
                <Caption style={{ lineHeight: 18 }}>{insight.detail}</Caption>
              </View>
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
