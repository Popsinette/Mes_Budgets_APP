import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Body, Caption, Eyebrow } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { stopFixedItem } from '@/src/features/fixed/repository';
import { getLevers } from '@/src/features/guide/repository';
import { setPlanSkipped } from '@/src/features/savings/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { monthKeyLabel, shiftMonthKey, type MonthKey } from '@/src/utils/dates';
import { confirmAction } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

/**
 * « Retrouver de la marge » — seulement quand le mois est dans le rouge : ce
 * qui manque, puis les leviers. Épargne du mois à sauter (effet immédiat sur
 * le plan), enveloppes où freiner, abonnements et leur coût sur un an (les
 * arrêter allège les mois suivants).
 */
export function LeversCard({ month }: { month: MonthKey }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { data: l } = useLiveQuery((db) => getLevers(db, month), [month]);
  if (!l || l.missing_cents === 0) return null;
  const name = monthKeyLabel(month).split(' ')[0];
  const next = shiftMonthKey(month, 1);
  const nextName = monthKeyLabel(next).split(' ')[0];
  const savings = l.savings.reduce((s, x) => s + x.cents, 0);
  const subs = l.subscriptions.filter((s) => s.item.amount_cents < 50000).slice(0, 5);

  const tap = (run: () => Promise<void>) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void run();
  };

  return (
    <Card style={{ gap: spacing.md, borderColor: theme.colors.danger }}>
      <View>
        <Eyebrow tone="danger">Retrouver de la marge</Eyebrow>
        <Body size={14.5} style={{ marginTop: 4 }}>
          Il manque{' '}
          <Body weight="bold" size={14.5} tone="danger">
            {formatCents(l.missing_cents)}
          </Body>{' '}
          en {name}. Voici où les trouver :
        </Body>
      </View>

      {l.savings.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Caption tone="text">
            1. Décaler l’épargne de {name} ({formatCents(savings)}
            {savings >= l.missing_cents ? ', ça suffit' : ''})
          </Caption>
          {l.savings.map(({ pot, cents }) => (
            <Row key={pot.id} icon={pot.icon} color={pot.color} title={pot.name} detail={`+${formatCents(cents)} sur ${name}`}>
              <Action label="Pas ce mois-ci" onPress={tap(() => setPlanSkipped(db, pot.id, month, true))} />
            </Row>
          ))}
        </View>
      ) : null}

      {l.envelopes.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Caption tone="text">{l.savings.length > 0 ? '2' : '1'}. Freiner là où il reste de la place</Caption>
          {l.envelopes.slice(0, 3).map(({ envelope, left_cents }) => (
            <Row
              key={envelope.id}
              icon={envelope.icon}
              color={envelope.color}
              title={envelope.name}
              detail={`Il reste ${formatCents(left_cents)} : chaque euro gardé réduit le trou`}
            />
          ))}
        </View>
      ) : null}

      {subs.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Caption tone="text">Et pour les mois suivants : tes abonnements sur un an</Caption>
          {subs.map(({ item, yearly_cents }) => (
            <Row
              key={item.id}
              icon={item.icon ?? 'receipt-outline'}
              color={theme.colors.navy}
              title={item.name}
              detail={`${formatCents(item.amount_cents)}/mois · ${formatCents(yearly_cents, { compact: true })}/an`}
            >
              <Action
                label="Arrêter"
                onPress={() =>
                  confirmAction({
                    title: `Arrêter ${item.name} ?`,
                    message: `À ne faire qu’une fois l’abonnement résilié. Il disparaît de ton plan à partir de ${nextName} (${formatCents(yearly_cents)} de moins sur un an).`,
                    confirmLabel: 'Arrêter',
                    onConfirm: () => void stopFixedItem(db, item, next),
                  })
                }
              />
            </Row>
          ))}
        </View>
      ) : null}

      <Caption tone="primary" onPress={() => router.push('/enveloppes')} accessibilityRole="link">
        Ajuster mes enveloppes →
      </Caption>
    </Card>
  );
}

function Row({
  icon,
  color,
  title,
  detail,
  children,
}: {
  icon: string;
  color: string;
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <CategoryIcon icon={icon} color={color} size={34} />
      <View style={{ flex: 1 }}>
        <Body weight="semibold" size={14}>
          {title}
        </Body>
        <Caption>{detail}</Caption>
      </View>
      {children}
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.action, { backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.7 : 1 }]}
    >
      <Body size={13} weight="semibold" color={theme.colors.primary}>
        {label}
      </Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  action: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.full },
});

