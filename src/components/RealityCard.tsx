import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Body, Caption, Eyebrow } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { applyReality, getEnvelopeReality } from '@/src/features/guide/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { monthKeyLabel, type MonthKey } from '@/src/utils/dates';
import { notify } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

/**
 * « Mes enveloppes face à la réalité » : pour `month`, les enveloppes dont le
 * montant s'écarte de ce qui est vraiment dépensé en moyenne (derniers mois).
 * « Ajuster » change le montant du mois et celui de « Ma base ».
 */
export function RealityCard({ month }: { month: MonthKey }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { data } = useLiveQuery((db) => getEnvelopeReality(db, month), [month]);
  if (!data || data.length === 0) return null;
  const name = monthKeyLabel(month).split(' ')[0];

  const apply = async (input: { name: string; period: 'week' | 'month'; cents: number }) => {
    try {
      await applyReality(db, month, input);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      notify('Impossible', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <Eyebrow>Mes enveloppes face à la réalité</Eyebrow>
      <Caption>
        Ce que tu dépenses vraiment en moyenne ces derniers mois. Un budget réaliste tient mieux : ajuste {name} et ta base
        d’un toucher.
      </Caption>
      {data.map((r) => {
        const unit = r.period === 'week' ? '/sem.' : '/mois';
        const up = r.suggested_cents > r.current_cents;
        return (
          <View key={`${r.period}|${r.name}`} style={[styles.row, { borderTopColor: theme.colors.hairline }]}>
            <CategoryIcon icon={r.icon} color={r.color} size={36} />
            <View style={{ flex: 1 }}>
              <Body weight="semibold" size={14.5}>
                {r.name}
              </Body>
              <Caption>
                Prévu {formatCents(r.current_cents, { compact: true })}
                {unit} · dépensé ~{formatCents(Math.round(r.average_cents / 100) * 100, { compact: true })}
                {unit} ({r.months} mois)
              </Caption>
            </View>
            <Pressable
              onPress={() => void apply({ name: r.name, period: r.period, cents: r.suggested_cents })}
              accessibilityRole="button"
              accessibilityLabel={`Passer ${r.name} à ${formatCents(r.suggested_cents)} ${unit}`}
              style={({ pressed }) => [styles.action, { backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.7 : 1 }]}
            >
              <Body size={13} weight="semibold" color={theme.colors.primary}>
                {up ? '↑' : '↓'} {formatCents(r.suggested_cents, { compact: true })}
              </Body>
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1 },
  action: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.full },
});
