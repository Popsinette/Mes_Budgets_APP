import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppHeader } from '@/src/components/ui/AppHeader';
import { Card } from '@/src/components/ui/Card';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Segmented } from '@/src/components/ui/Segmented';
import { Body, Caption, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  listPots,
  POT_KIND_LABELS,
  setPlanDone,
  setPlanSkipped,
  type PotKind,
  type PotWithBalance,
} from '@/src/features/savings/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, isoDayInMonth, monthKeyLabel, numericDate, todayIso } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

export default function PotsScreen() {
  const theme = useTheme();
  const month = useSelectedMonth((s) => s.month);
  const [kind, setKind] = useState<PotKind>('projet');
  const { data: pots } = useLiveQuery((db) => listPots(db, month), [month]);
  const { data: summary } = useLiveQuery((db) => getMonthSummary(db, month), [month]);

  const planned = summary?.savings_planned_cents ?? 0;
  const income = summary?.income_cents ?? 0;
  const list = (pots ?? []).filter((p) => p.kind === kind);
  const total = list.reduce((s, p) => s + p.balance_cents, 0);
  const monthName = monthKeyLabel(month).split(' ')[0];
  const scheduled = (pots ?? []).filter((p) => (p.monthly_cents ?? 0) > 0);
  const skipped = scheduled.filter((p) => p.plan_skipped === 1);

  return (
    <Screen bottomInset={90}>
      <AppHeader title="Mes économies" />

      <View style={styles.topRow}>
        <Card style={[styles.forecast, { borderColor: theme.colors.primary }]}>
          <View style={styles.forecastHead}>
            <Ionicons name="bag-handle" size={20} color={theme.colors.primary} />
            <Body weight="semibold" size={14} style={{ textAlign: 'center', flex: 1 }}>
              Prévisions de {monthName}
            </Body>
          </View>
          <Money cents={planned} size={20} weight="bold" color={theme.colors.primary} />
          <Caption style={{ fontStyle: 'italic', textAlign: 'center' }}>
            {income > 0 ? `soit ${((planned / income) * 100).toFixed(1).replace('.', ',')} % de tes revenus` : 'versements programmés'}
          </Caption>
          {skipped.length > 0 ? (
            <Caption style={{ textAlign: 'center', fontSize: 11.5 }}>
              {skipped.length === 1 ? '1 cagnotte en pause' : `${skipped.length} cagnottes en pause`} ce mois-ci
            </Caption>
          ) : null}
        </Card>
        <View style={styles.actions}>
          <PillButton
            icon="add"
            label="Ajouter une cagnotte"
            color={theme.colors.primary}
            onPress={() => router.push({ pathname: '/poche', params: { kind } })}
          />
          <PillButton
            icon="repeat"
            label="Mes virements"
            color={theme.colors.secondary}
            onPress={() => router.push('/virements')}
          />
        </View>
      </View>

      <Segmented
        segments={[
          { key: 'projet', label: POT_KIND_LABELS.projet },
          { key: 'securite', label: POT_KIND_LABELS.securite },
        ]}
        value={kind}
        onChange={setKind}
      />

      <View style={styles.countRow}>
        <Ionicons name="play-circle-outline" size={22} color={theme.colors.text} />
        <Body weight="semibold" size={17} style={{ flex: 1 }}>
          Mes cagnottes ({list.length})
        </Body>
        <Money cents={total} size={17} weight="bold" color={theme.colors.primary} />
      </View>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon="bag-handle-outline"
            title="Aucune cagnotte ici"
            subtitle={
              kind === 'projet'
                ? 'Vacances, voiture, travaux… crée une cagnotte pour chaque projet.'
                : 'Ton matelas de sécurité : l’argent auquel on ne touche pas.'
            }
          />
        </Card>
      ) : (
        <View style={styles.grid}>
          {list.map((pot) => (
            <PotCard key={pot.id} pot={pot} month={month} />
          ))}
        </View>
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
    </Screen>
  );
}

function PotCard({ pot, month }: { pot: PotWithBalance; month: string }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const ratio = pot.target_cents ? pot.balance_cents / pot.target_cents : 0;
  const done = pot.plan_done === 1;
  const skipped = pot.plan_skipped === 1;

  const togglePlan = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (skipped) {
      void setPlanSkipped(db, pot.id, month, false);
      return;
    }
    void setPlanDone(db, pot, month, !done, planDate(month));
  };

  return (
    <Card
      style={styles.potCard}
      onPress={() => router.push({ pathname: '/poche-detail', params: { id: String(pot.id) } })}
    >
      <View style={[styles.cover, { backgroundColor: `${pot.color}33` }]}>
        <Ionicons
          name={(pot.icon in Ionicons.glyphMap ? pot.icon : 'wallet-outline') as keyof typeof Ionicons.glyphMap}
          size={34}
          color={pot.color}
        />
        {pot.monthly_cents ? (
          <Pressable
            hitSlop={8}
            onPress={togglePlan}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={
              skipped
                ? `${pot.name} : pas de versement ce mois-ci. Reprendre`
                : `Versement du mois de ${formatCents(pot.monthly_cents)} pour ${pot.name}`
            }
            style={[styles.planCheck, { backgroundColor: theme.colors.card }]}
          >
            <Ionicons
              name={skipped ? 'pause-circle-outline' : done ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={done ? theme.colors.secondary : theme.colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
      <Body weight="semibold" size={14} style={styles.potName} numberOfLines={1}>
        {pot.name.toUpperCase()}
      </Body>
      {pot.deadline ? (
        <Caption style={{ fontStyle: 'italic', fontSize: 11 }}>Limite : {numericDate(pot.deadline)}</Caption>
      ) : null}
      <Body size={14}>
        <Body weight="bold" size={14}>
          {formatCents(pot.balance_cents, { compact: true })}
        </Body>
        {pot.target_cents ? <Caption> /{formatCents(pot.target_cents, { compact: true })}</Caption> : null}
      </Body>
      {pot.target_cents ? (
        <View style={styles.progressRow}>
          <View style={{ flex: 1 }}>
            <ProgressBar ratio={ratio} color={ratio >= 1 ? theme.colors.success : theme.colors.primary} height={5} />
          </View>
          <Caption style={{ fontSize: 10.5 }}>{Math.round(ratio * 100)}%</Caption>
        </View>
      ) : null}
    </Card>
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
      <View style={[styles.planIcon, { backgroundColor: pot.color, opacity: skipped ? 0.45 : 1 }]}>
        <Ionicons
          name={(pot.icon in Ionicons.glyphMap ? pot.icon : 'wallet-outline') as keyof typeof Ionicons.glyphMap}
          size={17}
          color={theme.colors.onAccent}
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
    flex: 1.1,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pill: {
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
