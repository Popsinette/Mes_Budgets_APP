import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Body, Caption } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getStreaks } from '@/src/features/coach/repository';
import { radius, spacing, useTheme } from '@/src/theme';

/**
 * Mes séries : semaines d'affilée dans le budget, mois tenus, jours sans
 * dépense. Trois petits compteurs pour donner envie de continuer.
 */
export function StreakStrip() {
  const theme = useTheme();
  const { data } = useLiveQuery((db) => getStreaks(db), []);
  if (!data) return null;
  if (data.weeks_in_budget === 0 && data.best_weeks === 0 && data.months_held === 0) return null;
  const alive = data.week_on_track !== false;
  const tiles: Array<{ icon: keyof typeof Ionicons.glyphMap; value: number; label: string; hint: string; color: string; soft: string }> = [
    {
      icon: 'flame',
      value: data.weeks_in_budget,
      label: data.weeks_in_budget > 1 ? 'semaines tenues' : 'semaine tenue',
      hint:
        data.week_on_track === false
          ? 'Ça déborde'
          : data.best_weeks > data.weeks_in_budget
            ? `Record : ${data.best_weeks}`
            : data.weeks_in_budget > 0
              ? 'Ton record !'
              : 'Repart lundi',
      color: alive && data.weeks_in_budget > 0 ? theme.colors.warning : theme.colors.textMuted,
      soft: alive && data.weeks_in_budget > 0 ? theme.colors.warningSoft : theme.colors.cardMuted,
    },
    {
      icon: 'trophy',
      value: data.months_held,
      label: 'mois au vert',
      hint: data.months_held > 0 ? 'd’affilée' : 'À toi de jouer',
      color: data.months_held > 0 ? theme.colors.success : theme.colors.textMuted,
      soft: data.months_held > 0 ? theme.colors.successSoft : theme.colors.cardMuted,
    },
    {
      icon: 'leaf',
      value: data.no_spend_days,
      label: data.no_spend_days > 1 ? 'jours à 0 €' : 'jour à 0 €',
      hint: 'ce mois-ci',
      color: theme.colors.primary,
      soft: theme.colors.primarySoft,
    },
  ];
  return (
    <View style={styles.row} accessibilityRole="summary">
      {tiles.map((t) => (
        <View
          key={t.icon}
          accessible
          accessibilityLabel={`${t.value} ${t.label}, ${t.hint}`}
          style={[
            styles.tile,
            { backgroundColor: theme.colors.card, borderColor: theme.dark ? theme.colors.border : 'transparent' },
          ]}
        >
          <View style={styles.head}>
            <View style={[styles.dot, { backgroundColor: t.soft }]}>
              <Ionicons name={t.icon} size={15} color={t.color} />
            </View>
            <Body weight="bold" size={20}>
              {t.value}
            </Body>
          </View>
          <Caption tone="text" numberOfLines={1} style={{ fontSize: 12 }}>
            {t.label}
          </Caption>
          <Caption numberOfLines={1} style={{ fontSize: 11.5 }}>
            {t.hint}
          </Caption>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
