import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { LineChart } from '@/src/components/charts/LineChart';
import { Card } from '@/src/components/ui/Card';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getAccountTimeline } from '@/src/features/guide/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { shortDayLabel } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

const short = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * « Mon compte jusqu'à la fin du mois » : le solde prévu jour par jour, son
 * point le plus bas (découvert avant la paie ?) et ce qui va passer dans les
 * prochains jours. La courbe finit sur la fin de mois prévue.
 */
export function TimelineCard() {
  const theme = useTheme();
  const { data: t } = useLiveQuery((db) => getAccountTimeline(db), []);
  if (!t) return null;
  const negative = t.low.balance_cents < 0;
  const soon = t.events.slice(0, 6);
  // La paie (le plus gros revenu à venir) : « avant ta paie du 28 ».
  const pay = [...t.events].filter((e) => e.kind === 'income').sort((a, b) => b.cents - a.cents)[0];

  return (
    <Card style={{ gap: spacing.md }}>
      <View>
        <Eyebrow>Mon compte jusqu’au {short(t.days.at(-1)!.date)}</Eyebrow>
        <View style={[styles.verdict, { backgroundColor: negative ? theme.colors.dangerSoft : theme.colors.successSoft }]}>
          <Ionicons
            name={negative ? 'warning' : 'checkmark-circle'}
            size={18}
            color={negative ? theme.colors.danger : theme.colors.success}
          />
          <Body size={13.5} style={{ flex: 1 }} color={negative ? theme.colors.danger : theme.colors.success}>
            {negative
              ? `Découvert prévu : ${formatCents(t.low.balance_cents)} le ${shortDayLabel(t.low.date)}${
                  pay && pay.date > t.low.date ? `, avant « ${pay.label} » le ${shortDayLabel(pay.date)}` : ''
                }.`
              : `Ton compte reste positif : au plus bas ${formatCents(t.low.balance_cents)} le ${shortDayLabel(t.low.date)}.`}
          </Body>
        </View>
      </View>

      <LineChart
        points={t.days.map((d, i) => ({ label: short(d.date), cents: d.balance_cents, projected: i > 0 }))}
        color={theme.colors.primary}
        projectionColor={negative ? theme.colors.danger : theme.colors.primary}
      />

      {soon.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Eyebrow>Ce qui va passer</Eyebrow>
          {soon.map((e, i) => (
            <View key={`${e.date}-${e.label}-${i}`} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.hairline }]}>
              <Caption style={{ width: 44 }}>{short(e.date)}</Caption>
              <Body size={14} style={{ flex: 1 }} numberOfLines={1}>
                {e.label}
              </Body>
              <Money cents={e.cents} signed size={14} weight="semibold" tone={e.cents > 0 ? 'income' : 'text'} />
            </View>
          ))}
          {t.events.length > soon.length ? <Caption>… et {t.events.length - soon.length} de plus.</Caption> : null}
        </View>
      ) : null}
      <Caption>
        Les enveloppes sont comptées au fil des jours : environ {formatCents(t.daily_envelopes_cents, { compact: true })} par jour.
      </Caption>
      {negative ? (
        <Caption tone="primary" onPress={() => router.push('/synthese')} accessibilityRole="link">
          Pour l’éviter : décale un virement d’épargne ou freine une enveloppe d’ici là → Mon plan
        </Caption>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  verdict: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm + 2, borderRadius: radius.md, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
});
