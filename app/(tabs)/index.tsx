import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ProgressRing } from '@/src/components/charts/ProgressRing';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { AppHeader } from '@/src/components/ui/AppHeader';
import { Card } from '@/src/components/ui/Card';
import { CheckRow } from '@/src/components/ui/CheckRow';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { Screen } from '@/src/components/ui/Screen';
import { Segmented } from '@/src/components/ui/Segmented';
import { StatTrio } from '@/src/components/ui/StatTrio';
import { Body, Caption, Heading, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteExpense,
  listEnvelopesForMonth,
  resolveEnvelopeId,
  searchExpenses,
  type EnvelopeForMonth,
  type Expense,
} from '@/src/features/envelopes/repository';
import { getAnnualCharges, listFixedForMonth, setFixedChecked, type FixedItemForMonth } from '@/src/features/fixed/repository';
import { listHealthForMonth, setHealthSettled, type HealthExpense } from '@/src/features/health/repository';
import { AccountCard } from '@/src/components/AccountCard';
import { ExpenseList } from '@/src/components/ExpenseList';
import { ClosurePrompt } from '@/src/components/ClosurePrompt';
import { HabitsDue } from '@/src/components/HabitsDue';
import { ForecastPill } from '@/src/components/ForecastPill';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, currentWeekKey, numericDate, shiftMonthKey, weekProgressLabel } from '@/src/utils/dates';
import { confirmAction } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

type Tab = 'variables' | 'fixes' | 'revenus' | 'sante';

const SEGMENTS: Array<{ key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'variables', label: 'Variables', icon: 'basket-outline' },
  { key: 'fixes', label: 'Factures', icon: 'receipt-outline' },
  { key: 'revenus', label: 'Revenus', icon: 'wallet-outline' },
  { key: 'sante', label: 'Santé', icon: 'medkit-outline' },
];

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export default function BudgetScreen() {
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const [tab, setTab] = useState<Tab>('variables');

  return (
    <Screen bottomInset={90}>
      <AppHeader title="Mon budget" />
      <MonthSwitcher month={month} onChange={setMonth} subtitle={weekProgressLabel(month)} />
      <ForecastPill month={month} />
      {month >= shiftMonthKey(currentMonthKey(), -1) && month <= currentMonthKey() ? <ClosurePrompt /> : null}
      {month === currentMonthKey() ? (
        <AccountCard />
      ) : month > currentMonthKey() ? (
        <Caption style={{ textAlign: 'center' }}>
          Mois à venir : le prévisionnel est ton plan (revenus − charges − enveloppes − épargne), sans tenir compte de
          ton solde actuel.
        </Caption>
      ) : null}
      <Segmented segments={SEGMENTS} value={tab} onChange={setTab} />
      {tab === 'variables' ? <VariablesTab month={month} /> : null}
      {tab === 'fixes' ? <FixedTab month={month} kind="charge" /> : null}
      {tab === 'revenus' ? <FixedTab month={month} kind="income" /> : null}
      {tab === 'sante' ? <HealthTab month={month} /> : null}
    </Screen>
  );
}

/* ─────────────── Variables : semaine + montants fixes du mois ─────────────── */

/**
 * Tout ce qui n'est pas une facture : enveloppes de la semaine (Courses,
 * Plaisir…) et montants fixes du mois (Coiffure 60 €, Essence…) — un montant
 * prévu, mais pas une charge prélevée.
 */
function VariablesTab({ month }: { month: string }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const week = currentWeekKey();
  const { data: envelopes } = useLiveQuery((db) => listEnvelopesForMonth(db, month, week), [month, week]);
  const { data: expenses } = useLiveQuery((db) => searchExpenses(db, { month, query: '' }), [month]);
  const weekly = (envelopes ?? []).filter((e) => e.period === 'week');
  const monthly = (envelopes ?? []).filter((e) => e.period === 'month');
  const all = envelopes ?? [];
  const budget = all.reduce((s, e) => s + e.budget_cents, 0);
  const spent = all.reduce((s, e) => s + e.spent_cents, 0);
  const left = budget - spent;
  const latest = (expenses ?? []).slice(0, 8);

  const confirmDelete = (expense: Expense) =>
    confirmAction({
      title: 'Supprimer la dépense',
      message: `Supprimer « ${expense.label} » (${formatCents(expense.amount_cents)}) ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => void deleteExpense(db, expense.id),
    });

  return (
    <>
      {month === currentMonthKey() ? <HabitsDue /> : null}
      <Card style={{ gap: spacing.sm }}>
        <View style={styles.overviewRow}>
          <View style={{ flex: 1 }}>
            <Caption>Mes variables du mois</Caption>
            <Money cents={left} size={26} weight="bold" tone={left < 0 ? 'danger' : 'text'} />
            <Caption>{left < 0 ? 'de dépassement' : 'encore disponibles'}</Caption>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Caption>Dépensé</Caption>
            <Money cents={spent} size={15} weight="semibold" />
            <Caption>sur {formatCents(budget)}</Caption>
          </View>
        </View>
        <ProgressBar ratio={budget > 0 ? spent / budget : 0} height={8} />
      </Card>

      <SectionHeader title="Chaque semaine" />
      <View style={styles.grid}>
        {weekly.map((envelope) => (
          <EnvelopeCard key={envelope.id} envelope={envelope} month={month} />
        ))}
        {weekly.length === 0 ? (
          <Card style={{ flexBasis: '100%' }}>
            <Caption style={{ textAlign: 'center' }}>Courses, Plaisir… : un montant par semaine, du lundi au dimanche.</Caption>
          </Card>
        ) : null}
      </View>

      <SectionHeader title="Montants fixes du mois" />
      <Caption>Coiffure, essence, cantine… : un montant prévu chaque mois, sans être une facture.</Caption>
      {monthly.length > 0 ? (
        <Card style={styles.listCard}>
          {monthly.map((envelope, i) => (
            <MonthlyRow key={envelope.id} envelope={envelope} last={i === monthly.length - 1} />
          ))}
        </Card>
      ) : null}
      <View style={styles.addRow}>
        <AddTile
          icon="add"
          label="Montant fixe"
          onPress={() => router.push({ pathname: '/enveloppe', params: { period: 'month', month } })}
        />
        <AddTile icon="options-outline" label="Gérer mes enveloppes" onPress={() => router.push('/enveloppes')} />
      </View>

      <View style={styles.sectionRow}>
        <Heading style={[styles.sectionTitle, { flex: 1 }]}>Dernières dépenses</Heading>
        <SearchLink />
      </View>
      <ExpenseList
        expenses={latest}
        empty="Note chaque achat dès que tu le fais : ton reste se met à jour."
        onDelete={confirmDelete}
      />
      {(expenses ?? []).length > latest.length ? (
        <Pressable onPress={() => router.push('/depenses')} accessibilityRole="button" hitSlop={8}>
          <Caption tone="primary" style={{ textAlign: 'center' }}>
            Voir les {(expenses ?? []).length} dépenses du mois
          </Caption>
        </Pressable>
      ) : null}
    </>
  );
}

/** Ligne d'un montant fixe du mois : pastille, dépensé / prévu, jauge, reste. */
function MonthlyRow({ envelope, last }: { envelope: EnvelopeForMonth; last: boolean }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const left = envelope.budget_cents - envelope.spent_cents;
  const ratio = envelope.budget_cents > 0 ? envelope.spent_cents / envelope.budget_cents : 0;
  const unset = envelope.weekly_cents === 0 && envelope.budget_cents === 0;
  return (
    <Pressable
      onPress={() => void openEnvelope(db, envelope, unset ? 'edit' : 'detail')}
      accessibilityRole="button"
      accessibilityLabel={`${envelope.name} : ${formatCents(envelope.spent_cents)} sur ${formatCents(envelope.budget_cents)}`}
      style={({ pressed }) => [
        styles.monthlyRow,
        !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <CategoryIcon icon={envelope.icon} color={envelope.color} size={38} />
      <View style={{ flex: 1, gap: 5 }}>
        <View style={styles.monthlyHead}>
          <Body weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
            {envelope.name}
          </Body>
          <Body size={14}>
            <Body weight="bold" size={14}>
              {formatCents(envelope.spent_cents)}
            </Body>
            {` / ${formatCents(envelope.budget_cents)}`}
          </Body>
        </View>
        <ProgressBar ratio={ratio} color={ratio > 1 ? theme.colors.danger : envelope.color} height={6} />
        <Caption tone={left < 0 ? 'danger' : 'muted'}>
          {unset ? 'Touche pour fixer le montant' : left < 0 ? `Dépassé de ${formatCents(-left)}` : `Reste ${formatCents(left)}`}
        </Caption>
      </View>
    </Pressable>
  );
}

/** Lien « Rechercher » vers toutes les dépenses (« Mes dépenses »). */
function SearchLink() {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/depenses')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Rechercher dans mes dépenses"
      style={({ pressed }) => [styles.searchLink, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name="search" size={16} color={theme.colors.primary} />
      <Caption tone="primary">Tout voir · rechercher</Caption>
    </Pressable>
  );
}

/**
 * Ouvre une enveloppe (détail ou modification). Si le mois suit encore la
 * base, il est d'abord créé : ses enveloppes deviennent les siennes.
 */
async function openEnvelope(db: SQLiteDatabase, envelope: EnvelopeForMonth, mode: 'edit' | 'detail') {
  const id = await resolveEnvelopeId(db, envelope);
  if (!id) return;
  if (mode === 'edit') router.push({ pathname: '/enveloppe', params: { id: String(id), month: envelope.month } });
  else router.push({ pathname: '/enveloppe-detail', params: { id: String(id), month: envelope.month } });
}

function EnvelopeCard({ envelope, month }: { envelope: EnvelopeForMonth; month: string }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const left = envelope.budget_cents - envelope.spent_cents;
  const ratio = envelope.budget_cents > 0 ? envelope.spent_cents / envelope.budget_cents : 0;
  const isCurrent = month === currentMonthKey();
  const weekLeft = envelope.weekly_cents - envelope.week_spent_cents;
  // Montant pas encore fixé : la carte mène directement à sa modification.
  const unset = envelope.weekly_cents === 0;
  return (
    <Card
      style={styles.envelopeCard}
      onPress={() => void openEnvelope(db, envelope, unset ? 'edit' : 'detail')}
    >
      <Body weight="semibold" size={16} numberOfLines={1}>
        {envelope.name}
      </Body>
      <Body size={15}>
        <Body weight="bold" size={15}>
          {formatCents(envelope.spent_cents)}
        </Body>
        {` / ${formatCents(envelope.budget_cents)}`}
      </Body>
      <View style={styles.ringRow}>
        <ProgressRing ratio={ratio} color={ratio > 1 ? theme.colors.danger : envelope.color} size={92} strokeWidth={6}>
          <CategoryIcon icon={envelope.icon} color={envelope.color} size={70} />
        </ProgressRing>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} style={styles.chevron} />
      </View>
      <View style={[styles.envelopeFooter, { borderTopColor: theme.colors.hairline }]}>
        {unset ? (
          <Body size={13.5} weight="semibold" color={theme.colors.primary} style={{ textAlign: 'center' }}>
            Touche pour fixer ton budget
          </Body>
        ) : (
          <Body size={14} weight="semibold" style={{ fontStyle: 'italic' }} tone={left < 0 ? 'danger' : 'text'}>
            {left < 0 ? 'Dépassé' : 'Reste'} : {formatCents(Math.abs(left))}
          </Body>
        )}
        {isCurrent && envelope.weekly_cents > 0 ? (
          <Caption tone={weekLeft < 0 ? 'danger' : 'muted'}>
            Cette semaine : {formatCents(weekLeft)}
          </Caption>
        ) : null}
      </View>
    </Card>
  );
}

function AddTile({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.addTile, { backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name={icon} size={18} color={theme.colors.primary} />
      <Body size={14} weight="semibold" color={theme.colors.primary}>
        {label}
      </Body>
    </Pressable>
  );
}

/* ─────────────── Fixes & Revenus ─────────────── */

function FixedTab({ month, kind }: { month: string; kind: 'charge' | 'income' }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { data: items } = useLiveQuery((db) => listFixedForMonth(db, month), [month]);
  const list = (items ?? []).filter((i) => i.kind === kind);
  const isCharge = kind === 'charge';
  const total = list.reduce((s, i) => s + i.amount_cents, 0);
  const done = list.filter((i) => i.checked).reduce((s, i) => s + i.amount_cents, 0);
  const isCurrent = month === currentMonthKey();
  const today = new Date().getDate();

  const toggle = (item: FixedItemForMonth) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setFixedChecked(db, item.id, month, !item.checked);
  };

  return (
    <>
      <SectionTitle icon="bar-chart" label={isCharge ? 'Mes factures et charges fixes' : 'Mes revenus'} />
      {isCharge ? (
        <Caption>Prélevées chaque mois (loyer, électricité, abonnements…). Les montants prévus comme la coiffure vont dans Variables.</Caption>
      ) : null}
      <StatTrio
        stats={[
          { label: 'Total', cents: total, icon: 'wallet-outline', color: theme.colors.secondary },
          {
            label: isCharge ? 'Réglé' : 'Crédité',
            cents: done,
            icon: 'checkmark-circle-outline',
            color: theme.colors.rose,
          },
          {
            label: isCharge ? 'À débiter' : 'À créditer',
            cents: total - done,
            icon: 'time-outline',
            color: theme.colors.navy,
            accent: isCharge ? theme.colors.primary : theme.colors.navy,
          },
        ]}
        ratio={total > 0 ? done / total : 0}
        ratioLabel={`${pct(done, total)} % ${isCharge ? 'réglé' : 'crédité'}`}
      />


      {isCharge ? <AnnualLink /> : null}

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={isCharge ? 'receipt-outline' : 'wallet-outline'}
            title={isCharge ? 'Aucune charge fixe' : 'Aucun revenu'}
            subtitle={
              isCharge
                ? 'Loyer, électricité, abonnements… ajoute-les avec le bouton +.'
                : 'Salaire, CAF… ajoute-les avec le bouton +.'
            }
          />
        </Card>
      ) : (
        <Card style={styles.listCard}>
          {list.map((item, i) => {
            const late = !item.checked && isCurrent && item.day < today;
            return (
              <CheckRow
                key={item.id}
                icon={item.icon ?? (isCharge ? 'receipt-outline' : 'cash-outline')}
                iconColor={late ? theme.colors.danger : theme.colors.secondary}
                title={item.name}
                subtitle={`Le ${item.day} du mois${late ? (isCharge ? ' · en retard' : ' · attendu') : ''}`}
                cents={item.amount_cents}
                sign={isCharge ? -1 : 1}
                checked={item.checked}
                onToggle={() => toggle(item)}
                onPress={() => router.push({ pathname: '/fixe', params: { id: String(item.id), month } })}
                last={i === list.length - 1}
              />
            );
          })}
        </Card>
      )}
    </>
  );
}

/** Lien vers « Mon année » quand des charges trimestrielles ou annuelles sont à lisser. */
function AnnualLink() {
  const theme = useTheme();
  const { data } = useLiveQuery((db) => getAnnualCharges(db, currentMonthKey()), []);
  if (!data || data.length === 0) return null;
  const provision = data.reduce((s, c) => s + c.monthly_provision_cents, 0);
  return (
    <Card onPress={() => router.push('/annee')} style={styles.annual}>
      <CategoryIcon icon="calendar-outline" color={theme.colors.navy} size={36} />
      <View style={{ flex: 1 }}>
        <Body weight="semibold">Mon année</Body>
        <Caption>
          {data.length === 1 ? '1 charge annuelle' : `${data.length} charges non mensuelles`} · {formatCents(provision, { compact: true })}/mois à prévoir
        </Caption>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Card>
  );
}

/* ─────────────── Santé ─────────────── */

function HealthTab({ month }: { month: string }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { data: items } = useLiveQuery((db) => listHealthForMonth(db, month), [month]);
  const list = items ?? [];
  const advanced = list.reduce((s, h) => s + h.amount_cents, 0);
  const refund = list.reduce((s, h) => s + h.refund_cents, 0);

  const settle = (item: HealthExpense) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setHealthSettled(db, item.id, item.settled !== 1);
  };

  return (
    <>
      <StatTrio
        stats={[
          { label: 'Avancé', cents: advanced, icon: 'wallet-outline', color: theme.colors.secondary },
          { label: 'Remboursé', cents: refund, icon: 'checkmark-circle-outline', color: theme.colors.rose },
          {
            label: 'Reste à charge',
            cents: advanced - refund,
            icon: 'time-outline',
            color: theme.colors.navy,
            accent: theme.colors.primary,
          },
        ]}
      />
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon="medkit-outline"
            title="Aucun frais de santé"
            subtitle="Note ce que tu avances (pharmacie, médecin…) et le remboursement attendu."
          />
        </Card>
      ) : (
        <Card style={styles.listCard}>
          {list.map((item, i) => (
            <CheckRow
              key={item.id}
              icon={item.settled ? 'checkmark-done-outline' : 'medkit-outline'}
              iconColor={item.settled ? theme.colors.navy : theme.colors.secondary}
              title={item.label}
              subtitle={`${numericDate(item.date)} · remb. ${formatCents(item.refund_cents)}`}
              cents={item.amount_cents}
              sign={-1}
              onPress={() => router.push({ pathname: '/sante', params: { id: String(item.id) } })}
              trailing={
                <Pressable
                  onPress={() => settle(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.settled ? `${item.label} : terminé` : `Solder ${item.label}`}
                  style={[
                    styles.badge,
                    item.settled
                      ? { backgroundColor: theme.colors.navy, borderColor: theme.colors.navy }
                      : { borderColor: theme.colors.primary },
                  ]}
                >
                  <Caption
                    style={{ fontSize: 12 }}
                    color={item.settled ? theme.colors.onAccent : theme.colors.text}
                  >
                    {item.settled ? 'Terminé' : 'Solder'}
                  </Caption>
                </Pressable>
              }
              last={i === list.length - 1}
            />
          ))}
        </Card>
      )}
    </>
  );
}

function SectionTitle({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Ionicons name={icon} size={16} color={theme.colors.primary} />
      <Body weight="semibold">{label}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  annual: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  overviewRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  addRow: { flexDirection: 'row', gap: spacing.sm },
  monthlyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  monthlyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  envelopeCard: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  chevron: {
    position: 'absolute',
    right: -26,
  },
  envelopeFooter: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    gap: 2,
  },
  addTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
  sectionTitle: {
    marginTop: spacing.sm,
    letterSpacing: 0.4,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  listCard: {
    paddingVertical: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1.5,
  },
});
