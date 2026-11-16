import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { useCountUp } from '@/src/components/ui/useCountUp';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getAccountStatus } from '@/src/features/account/repository';
import { listEnvelopesForMonth } from '@/src/features/envelopes/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, currentWeekKey, daysInMonthOf, monthKeyLabel, type MonthKey } from '@/src/utils/dates';
import { clampRatio, formatCents } from '@/src/utils/money';

const INK = '#FFFFFF';
const INK_MUTED = 'rgba(255,255,255,0.84)';
const GLASS = 'rgba(255,255,255,0.16)';

/**
 * Carte d'accueil : la réponse à « combien puis-je encore dépenser ? ».
 * Un grand chiffre (reste des enveloppes du mois), le rythme du mois, puis
 * trois repères : cette semaine, la fin de mois prévue (= la pastille du
 * prévisionnel, même formule que la Synthèse) et le compte.
 */
export function HomeHero({ month }: { month: MonthKey }) {
  const theme = useTheme();
  const week = currentWeekKey();
  const isCurrent = month === currentMonthKey();
  const { data } = useLiveQuery(
    async (db) => ({
      summary: await getMonthSummary(db, month),
      envelopes: await listEnvelopesForMonth(db, month, week),
      account: isCurrent ? await getAccountStatus(db) : null,
    }),
    [month, week, isCurrent],
  );
  const budget = data ? data.summary.variables_budget_cents + data.summary.postes_budget_cents : 0;
  const spent = data ? data.summary.variables_spent_cents + data.summary.postes_spent_cents : 0;
  const left = budget - spent;
  const shown = useCountUp(left);
  if (!data) return <Skeleton height={236} radius={radius.xl} />;

  const { summary, envelopes, account } = data;
  const name = monthKeyLabel(month).split(' ')[0];
  const days = daysInMonthOf(month);
  const today = new Date().getDate();
  const daysLeft = days - today + 1;
  const weekly = envelopes.filter((e) => e.period === 'week');
  const weekLeft = weekly.reduce((s, e) => s + e.weekly_cents - e.week_spent_cents, 0);
  const forecast = summary.forecast_left_cents;
  const future = month > currentMonthKey();
  const sub = !isCurrent
    ? `${formatCents(spent)} dépensés sur ${formatCents(budget, { compact: true })} prévus`
    : left > 0 && daysLeft > 0
      ? `sur ${formatCents(budget, { compact: true })} · environ ${formatCents(Math.floor(left / daysLeft / 100) * 100, { compact: true })} par jour`
      : `${formatCents(spent)} dépensés sur ${formatCents(budget, { compact: true })} prévus`;

  return (
    <LinearGradient
      colors={theme.dark ? ['#4A4296', '#6A4A9C', '#8A4E86'] : ['#6558CC', '#8E68D2', '#D0739C']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { shadowColor: theme.dark ? '#000' : '#5B4FC4' }]}
    >
      <View style={styles.head}>
        <Eyebrow color={INK_MUTED} style={{ flex: 1 }}>
          {left < 0 ? `Dépassement en ${name}` : future ? `Prévu pour ${name}` : isCurrent ? 'Reste à dépenser' : `Resté en ${name}`}
        </Eyebrow>
        {isCurrent ? (
          <View style={styles.badge}>
            <Caption color={INK} style={{ fontSize: 12 }}>
              Jour {today}/{days}
            </Caption>
          </View>
        ) : null}
      </View>
      <View accessible accessibilityLabel={`${left < 0 ? 'Dépassement' : 'Reste à dépenser'} : ${formatCents(left)}`}>
        <Money cents={Math.abs(shown)} size={40} weight="xbold" color={INK} />
        <Caption color={INK_MUTED}>{sub}</Caption>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${clampRatio(budget > 0 ? spent / budget : 0) * 100}%` }]} />
        {isCurrent ? <View style={[styles.marker, { left: `${clampRatio(today / days) * 100}%` }]} /> : null}
      </View>

      <View style={styles.tiles}>
        {isCurrent && weekly.length > 0 ? (
          <Tile label="Semaine" value={formatCents(weekLeft, { compact: true })} alert={weekLeft < 0} />
        ) : (
          <Tile label="Dépensé" value={formatCents(spent, { compact: true })} />
        )}
        <Tile
          label={forecast < 0 ? 'Dans le rouge' : 'Mon plan'}
          value={formatCents(forecast, { signed: true, compact: true })}
          alert={forecast < 0}
          onPress={() => router.push('/synthese')}
          hint="Voir le plan du mois"
        />
        {isCurrent ? (
          <Tile
            label="Compte"
            value={account ? formatCents(account.balance_cents, { compact: true }) : 'Saisir'}
            alert={account ? account.balance_cents < 0 : false}
            onPress={() => router.push('/compte')}
            hint="Ouvrir mon compte"
          />
        ) : null}
      </View>
    </LinearGradient>
  );
}

function Tile({
  label,
  value,
  alert,
  onPress,
  hint,
}: {
  label: string;
  value: string;
  alert?: boolean;
  onPress?: () => void;
  hint?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${label} : ${value}`}
      accessibilityHint={hint}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: alert ? theme.colors.card : GLASS, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View style={styles.tileHead}>
        <Caption numberOfLines={1} color={alert ? theme.colors.danger : INK_MUTED} style={{ fontSize: 11.5, flexShrink: 1 }}>
          {label}
        </Caption>
        {onPress ? <Ionicons name="chevron-forward" size={11} color={alert ? theme.colors.danger : INK_MUTED} /> : null}
      </View>
      <Body weight="bold" size={15} numberOfLines={1} adjustsFontSizeToFit color={alert ? theme.colors.danger : INK}>
        {value}
      </Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { backgroundColor: GLASS, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.26)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: INK },
  marker: { position: 'absolute', top: 0, width: 2, height: 8, backgroundColor: 'rgba(36,35,58,0.55)' },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 1 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
