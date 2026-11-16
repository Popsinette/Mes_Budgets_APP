import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card } from '@/src/components/ui/Card';
import { Body, Caption, Eyebrow } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getTodos, settleLate, type Todo } from '@/src/features/handover/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { monthKeyLabel } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  action?: { label: string; run: () => void };
  strong?: boolean;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthName = (m: string) => monthKeyLabel(m).split(' ')[0];

/**
 * « À faire » : les gestes qui attendent aujourd'hui, du plus important au
 * moins important — passer au mois suivant, cocher une facture passée,
 * confirmer un revenu, pointer ses dépenses. Rien à faire → rien d'affiché.
 */
export function TodoCard({ onShowTab }: { onShowTab: (tab: 'fixes' | 'revenus') => void }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { data } = useLiveQuery((db) => getTodos(db), []);
  if (!data || data.length === 0) return null;

  const tap = (run: () => Promise<void>) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void run();
  };
  const names = (t: Todo) => `${t.names.join(', ')}${t.count > t.names.length ? '…' : ''} · ${formatCents(t.cents)}`;

  const rows: Row[] = data.map((t): Row => {
    switch (t.key) {
      case 'handover': {
        const p = t.prompt!;
        const open = () => router.push({ pathname: '/cloture', params: { month: p.month } });
        return p.kind === 'finished'
          ? {
              icon: 'sparkles-outline',
              title: `${cap(monthName(p.month))} est fini`,
              subtitle:
                p.pending > 0
                  ? `Range ${p.pending === 1 ? 'ton reste' : `tes ${p.pending} restes`} et lance ${monthName(p.next)} en 3 étapes.`
                  : `Fais le point et lance ${monthName(p.next)} en 3 étapes.`,
              onPress: open,
              strong: true,
            }
          : {
              icon: 'calendar-outline',
              title:
                p.days_left === 0
                  ? `${cap(monthName(p.next))} commence demain`
                  : `${cap(monthName(p.next))} arrive dans ${p.days_left + 1} jours`,
              subtitle: 'Jette un œil à ton plan et ajuste tes enveloppes.',
              onPress: open,
              strong: true,
            };
      }
      case 'late-charges':
        return {
          icon: 'receipt-outline',
          title: t.count === 1 ? '1 facture à cocher' : `${t.count} factures à cocher`,
          subtitle: names(t),
          onPress: () => onShowTab('fixes'),
          action: { label: t.count === 1 ? 'Réglée' : 'Réglées', run: tap(() => settleLate(db, 'charge')) },
        };
      case 'late-incomes':
        return {
          icon: 'wallet-outline',
          title: t.count === 1 ? '1 revenu attendu' : `${t.count} revenus attendus`,
          subtitle: names(t),
          onPress: () => onShowTab('revenus'),
          action: { label: t.count === 1 ? 'Reçu' : 'Reçus', run: tap(() => settleLate(db, 'income')) },
        };
      default:
        return {
          icon: 'card-outline',
          title: t.count === 1 ? '1 dépense à pointer' : `${t.count} dépenses à pointer`,
          subtitle: `${formatCents(t.cents)} pas encore débités de ton compte`,
          onPress: () => router.push({ pathname: '/depenses', params: { pointer: '1' } }),
        };
    }
  });

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Eyebrow style={{ flex: 1 }}>À faire</Eyebrow>
        <View style={[styles.count, { backgroundColor: theme.colors.primarySoft }]}>
          <Caption color={theme.colors.primary} style={{ fontSize: 12 }}>
            {rows.length}
          </Caption>
        </View>
      </View>
      {rows.map((row, i) => (
        <View
          key={row.title}
          style={[
            styles.row,
            row.strong && { backgroundColor: theme.colors.primarySoft, borderRadius: radius.md, paddingHorizontal: spacing.md },
            !row.strong && i > 0 && !rows[i - 1].strong && { borderTopWidth: 1, borderTopColor: theme.colors.hairline },
          ]}
        >
          <Pressable
            onPress={row.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${row.title}. ${row.subtitle}`}
            style={({ pressed }) => [styles.main, { opacity: pressed ? 0.6 : 1 }]}
          >
            <View style={[styles.dot, { backgroundColor: row.strong ? theme.colors.card : theme.colors.primarySoft }]}>
              <Ionicons name={row.icon} size={18} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Body weight="semibold" size={14.5}>
                {row.title}
              </Body>
              <Caption numberOfLines={2}>{row.subtitle}</Caption>
            </View>
            {row.action ? null : (
              <Ionicons name="chevron-forward" size={18} color={row.strong ? theme.colors.primary : theme.colors.textMuted} />
            )}
          </Pressable>
          {row.action ? (
            <Pressable
              onPress={row.action.run}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${row.title} : ${row.action.label}`}
              style={({ pressed }) => [styles.action, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <Ionicons name="checkmark" size={14} color={theme.colors.onPrimary} />
              <Body size={13} weight="semibold" color={theme.colors.onPrimary}>
                {row.action.label}
              </Body>
            </Pressable>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, paddingVertical: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  count: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.full },
});
