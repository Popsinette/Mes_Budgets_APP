import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LineChart, type LinePoint } from '@/src/components/charts/LineChart';
import { AppHeader } from '@/src/components/ui/AppHeader';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Chip } from '@/src/components/ui/Chip';
import { Card } from '@/src/components/ui/Card';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  getSavingsProjection,
  listPots,
  POT_KIND_LABELS,
  setPlanDone,
  setPlanSkipped,
  type PotWithBalance,
} from '@/src/features/savings/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';
import {
  currentMonthKey,
  isoDayInMonth,
  monthKeyLabel,
  numericDate,
  shiftMonthKey,
  shortMonthLabel,
  todayIso,
} from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

export default function PotsScreen() {
  const theme = useTheme();
  const month = useSelectedMonth((s) => s.month);
  const { data: pots } = useLiveQuery((db) => listPots(db, month), [month]);
  const { data: summary } = useLiveQuery((db) => getMonthSummary(db, month), [month]);

  const planned = summary?.savings_planned_cents ?? 0;
  const income = summary?.income_cents ?? 0;
  const all = pots ?? [];
  const total = all.reduce((s, p) => s + p.balance_cents, 0);
  const withTarget = all.filter((p) => p.target_cents);
  const reached = withTarget.filter((p) => p.balance_cents >= (p.target_cents ?? 0)).length;
  const monthName = monthKeyLabel(month).split(' ')[0];
  const scheduled = all.filter((p) => (p.monthly_cents ?? 0) > 0);
  const skipped = scheduled.filter((p) => p.plan_skipped === 1);

  return (
    <Screen bottomInset={90}>
      <AppHeader title="Mes économies" />

      <Card style={[styles.hero, { backgroundColor: theme.colors.primarySoft }]}>
        <View style={styles.heroHead}>
          <MaterialCommunityIcons name="piggy-bank-outline" size={24} color={theme.colors.primary} />
          <Body weight="semibold" style={{ flex: 1 }}>
            Total de mon épargne
          </Body>
        </View>
        <Money cents={total} size={34} weight="xbold" color={theme.colors.primary} />
        <Caption tone="text">
          {all.length === 0
            ? 'Crée ta première cagnotte.'
            : `${all.length} cagnotte${all.length > 1 ? 's' : ''}${
                withTarget.length > 0 ? ` · ${reached}/${withTarget.length} objectif${withTarget.length > 1 ? 's' : ''} atteint${reached > 1 ? 's' : ''}` : ''
              }`}
        </Caption>
        <Caption>
          {planned > 0
            ? `En ${monthName} : ${formatCents(planned)} programmés${
                income > 0 ? ` (${((planned / income) * 100).toFixed(1).replace('.', ',')} % de tes revenus)` : ''
              }`
            : `Aucun versement programmé en ${monthName}.`}
          {skipped.length > 0 ? ` · ${skipped.length} en pause` : ''}
        </Caption>
        <View style={styles.actions}>
          <PillButton
            icon="add"
            label="Nouvelle cagnotte"
            color={theme.colors.primary}
            onPress={() => router.push({ pathname: '/poche', params: { kind: 'projet' } })}
          />
          <PillButton icon="repeat" label="Mes virements" color={theme.colors.navy} onPress={() => router.push('/virements')} />
        </View>
      </Card>

      {all.length === 0 ? (
        <Card>
          <EmptyState
            icon="wallet-outline"
            title="Aucune cagnotte"
            subtitle="Matelas de sécurité, vacances, voiture… crée une cagnotte par compte ou par projet."
          />
        </Card>
      ) : (
        (['securite', 'projet'] as const).map((kind) => {
          const group = all.filter((p) => p.kind === kind);
          if (group.length === 0) return null;
          return (
            <View key={kind} style={{ gap: spacing.sm }}>
              <View style={styles.groupHead}>
                <SectionHeader title={POT_KIND_LABELS[kind]} />
                <Money cents={group.reduce((s, p) => s + p.balance_cents, 0)} size={14} weight="semibold" tone="muted" />
              </View>
              <Card style={{ paddingVertical: spacing.xs }}>
                {group.map((pot, i) => (
                  <PotRow key={pot.id} pot={pot} last={i === group.length - 1} />
                ))}
              </Card>
            </View>
          );
        })
      )}

      {scheduled.length > 0 ? (
        <>
          <SectionHeader title={`Versements de ${monthName}`} />
          <Card style={{ paddingVertical: spacing.xs }}>
            {scheduled.map((pot, i) => (
              <PlanRow key={pot.id} pot={pot} month={month} last={i === scheduled.length - 1} />
            ))}
          </Card>
          <Caption style={{ textAlign: 'center' }}>
            « Pas ce mois-ci » : rien à mettre de côté ce mois-là, le montant reste prévu pour les mois suivants.
          </Caption>
        </>
      ) : null}

      <PlanProjection />
    </Screen>
  );
}

type Horizon = 'annee' | '12mois';

/**
 * « Si je suis mon plan » : le total de mes cagnottes à la fin de l'année (ou
 * dans 12 mois) si chaque versement programmé est fait — mois sautés exclus,
 * objectifs plafonnés. Une seule série (pointillé = projection), le détail par
 * cagnotte en tableau dessous.
 */
function PlanProjection() {
  const theme = useTheme();
  const [horizon, setHorizon] = useState<Horizon>('annee');
  const from = currentMonthKey();
  const yearEnd = `${from.slice(0, 4)}-12`;
  const to = horizon === 'annee' && yearEnd > from ? yearEnd : shiftMonthKey(from, 11);
  const { data } = useLiveQuery((db) => getSavingsProjection(db, from, to), [from, to]);
  if (!data) return null;
  const added = data.end_cents - data.now_cents;
  const monthly = data.pots.reduce((s, p) => s + p.monthly_cents, 0);
  const points: LinePoint[] = [
    { label: 'Auj.', cents: data.now_cents },
    ...data.months.map((m) => ({ label: shortMonthLabel(m.month), cents: m.total_cents, projected: true })),
  ];
  const endLabel = monthKeyLabel(to);

  return (
    <>
      <SectionHeader title="Mon plan d’épargne" />
      <Card style={{ gap: spacing.md }}>
        <View style={styles.horizon}>
          <Chip label="Fin d’année" selected={horizon === 'annee'} onPress={() => setHorizon('annee')} />
          <Chip label="Dans 12 mois" selected={horizon === '12mois'} onPress={() => setHorizon('12mois')} />
        </View>
        <View>
          <Caption>Si je suis mon plan, fin {endLabel}</Caption>
          <Money cents={data.end_cents} size={34} weight="xbold" color={theme.colors.primary} />
          <Caption>
            {monthly > 0
              ? `soit +${formatCents(added)} d’ici là, avec ${formatCents(monthly)} programmés par mois`
              : 'Aucun versement programmé : ajoute un montant mensuel à une cagnotte.'}
          </Caption>
        </View>
        {monthly > 0 ? (
          <LineChart points={points} color={theme.colors.primary} projectionColor={theme.colors.primary} zeroBased={false} />
        ) : null}
        {data.pots.length > 0 ? (
          <View>
            {data.pots.map((p, i) => (
              <View
                key={p.id}
                style={[styles.projRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.hairline }]}
              >
                <View style={[styles.projSwatch, { backgroundColor: theme.tint(p.color) }]} />
                <View style={{ flex: 1 }}>
                  <Body size={14} weight="medium" numberOfLines={1}>
                    {p.name}
                  </Body>
                  <Caption>
                    {p.monthly_cents > 0 ? `${formatCents(p.monthly_cents)} / mois` : 'pas de versement programmé'}
                    {p.reaches_target ? ' · objectif atteint 🎉' : ''}
                  </Caption>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Money cents={p.end_cents} size={14.5} weight="semibold" />
                  <Caption>aujourd’hui {formatCents(p.now_cents)}</Caption>
                </View>
              </View>
            ))}
          </View>
        ) : null}
        <Caption>
          Mois « Pas ce mois-ci » exclus, versements arrêtés à l’objectif, retraits non prévus. Touche un point pour voir
          le total du mois.
        </Caption>
      </Card>
    </>
  );
}

/**
 * Une cagnotte d'un coup d'œil : solde, objectif (jauge, %, ce qu'il reste,
 * date limite) ou versement mensuel. Toucher → détail ; crayon → corriger
 * le montant.
 */
function PotRow({ pot, last }: { pot: PotWithBalance; last: boolean }) {
  const theme = useTheme();
  const target = pot.target_cents ?? 0;
  const ratio = target > 0 ? pot.balance_cents / target : 0;
  const reached = target > 0 && pot.balance_cents >= target;
  const missing = Math.max(0, target - pot.balance_cents);
  const details = [
    target > 0 ? (reached ? 'Objectif atteint 🎉' : `${Math.round(ratio * 100)} % · encore ${formatCents(missing)}`) : 'Sans objectif',
    pot.deadline && !reached ? `avant le ${numericDate(pot.deadline)}` : null,
    pot.monthly_cents ? `+${formatCents(pot.monthly_cents)}/mois` : null,
  ].filter(Boolean);
  return (
    <View style={[styles.potRow, !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline }]}>
      <Pressable
        onPress={() => router.push({ pathname: '/poche-detail', params: { id: String(pot.id) } })}
        accessibilityRole="button"
        accessibilityLabel={`${pot.name} : ${formatCents(pot.balance_cents)}${target ? ` sur ${formatCents(target)}` : ''}`}
        style={({ pressed }) => [styles.potMain, { opacity: pressed ? 0.6 : 1 }]}
      >
        <CategoryIcon icon={pot.icon} color={pot.color} size={40} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.potHead}>
            <Body weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
              {pot.name}
            </Body>
            <Money cents={pot.balance_cents} size={16} weight="bold" />
          </View>
          {target > 0 ? (
            <View style={styles.potTargetRow}>
              <View style={{ flex: 1 }}>
                <ProgressBar ratio={ratio} color={reached ? theme.colors.success : pot.color} height={7} />
              </View>
              <Caption style={{ fontSize: 12 }}>/ {formatCents(target, { compact: true })}</Caption>
            </View>
          ) : null}
          <Caption numberOfLines={1}>{details.join(' · ')}</Caption>
        </View>
      </Pressable>
      <Pressable
        onPress={() => router.push({ pathname: '/poche', params: { id: String(pot.id) } })}
        accessibilityRole="button"
        accessibilityLabel={`Modifier le montant de ${pot.name}`}
        hitSlop={10}
        style={[styles.editBtn, { backgroundColor: theme.colors.primarySoft }]}
      >
        <Ionicons name="create-outline" size={17} color={theme.colors.primary} />
      </Pressable>
    </View>
  );
}

const planDate = (month: string) => (month === currentMonthKey() ? todayIso() : isoDayInMonth(month, 1));

/** Versement programmé du mois : coche « versé », ou « Pas ce mois-ci » (réversible). */
function PlanRow({ pot, month, last }: { pot: PotWithBalance; month: string; last: boolean }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const done = pot.plan_done === 1;
  const skipped = pot.plan_skipped === 1;
  const cents = pot.monthly_cents ?? 0;

  const toggleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setPlanDone(db, pot, month, !done, planDate(month));
  };
  const toggleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setPlanSkipped(db, pot.id, month, !skipped);
  };

  return (
    <View style={[styles.planRow, !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline }]}>
      <View style={[styles.planIcon, { backgroundColor: `${theme.tint(pot.color)}${theme.dark ? '33' : '22'}`, opacity: skipped ? 0.45 : 1 }]}>
        <Ionicons
          name={(pot.icon in Ionicons.glyphMap ? pot.icon : 'wallet-outline') as keyof typeof Ionicons.glyphMap}
          size={17}
          color={theme.tint(pot.color)}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Body weight="medium" numberOfLines={1} color={skipped ? theme.colors.textMuted : undefined}>
          {pot.name}
        </Body>
        <Caption>{skipped ? 'Pas ce mois-ci' : done ? 'Versé' : 'À verser'}</Caption>
      </View>
      <Money
        cents={cents}
        size={15}
        weight="semibold"
        tone={skipped ? 'muted' : 'text'}
        style={skipped ? { textDecorationLine: 'line-through' } : undefined}
      />
      <Pressable
        hitSlop={6}
        onPress={toggleSkip}
        accessibilityRole="button"
        accessibilityLabel={skipped ? `Reprendre le versement de ${pot.name} ce mois-ci` : `Pas de versement pour ${pot.name} ce mois-ci`}
        style={({ pressed }) => [
          styles.skipChip,
          {
            borderColor: skipped ? theme.colors.primary : theme.colors.border,
            backgroundColor: skipped ? `${theme.colors.primary}18` : 'transparent',
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <Caption style={{ fontSize: 11.5 }} color={skipped ? theme.colors.primary : undefined}>
          {skipped ? 'Reprendre' : 'Pas ce mois-ci'}
        </Caption>
      </Pressable>
      {skipped ? (
        <View style={{ width: 26 }} />
      ) : (
        <Pressable
          hitSlop={10}
          onPress={toggleDone}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={`${pot.name} : ${done ? 'versé' : 'à verser'}`}
        >
          <Ionicons
            name={done ? 'checkmark-circle' : 'ellipse-outline'}
            size={26}
            color={done ? theme.colors.secondary : theme.colors.textMuted}
          />
        </Pressable>
      )}
    </View>
  );
}

function PillButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.pill, { backgroundColor: color, opacity: pressed ? 0.85 : 1 }]}
    >
      <Ionicons name={icon} size={16} color={theme.colors.onAccent} />
      <Body size={13.5} weight="semibold" color={theme.colors.onAccent} numberOfLines={1}>
        {label}
      </Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.xs },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  potRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  potMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  potHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  potTargetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  horizon: { flexDirection: 'row', gap: spacing.sm },
  projRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  projSwatch: { width: 10, height: 10, borderRadius: 3 },
  topRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'stretch',
  },
  forecast: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    padding: spacing.md,
  },
  forecastHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  potCard: {
    width: '31.8%',
    padding: spacing.sm,
    alignItems: 'center',
    gap: 3,
  },
  cover: {
    alignSelf: 'stretch',
    height: 72,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  planCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: 12,
  },
  potName: {
    letterSpacing: 0.4,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  planIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  progressRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
});
