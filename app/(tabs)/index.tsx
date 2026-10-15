import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ProgressRing } from '@/src/components/charts/ProgressRing';
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
  listExpensesForMonth,
  resolveEnvelopeId,
  type EnvelopeForMonth,
  type Expense,
} from '@/src/features/envelopes/repository';
import { listFixedForMonth, setFixedChecked, type FixedItemForMonth } from '@/src/features/fixed/repository';
import { listHealthForMonth, setHealthSettled, type HealthExpense } from '@/src/features/health/repository';
import { AccountCard } from '@/src/components/AccountCard';
import { ExpenseList } from '@/src/components/ExpenseList';
import { ClosurePrompt } from '@/src/components/ClosurePrompt';
import { ForecastPill } from '@/src/components/ForecastPill';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, currentWeekKey, numericDate, shiftMonthKey, weekProgressLabel } from '@/src/utils/dates';
import { confirmAction } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

type Tab = 'variables' | 'fixes' | 'revenus' | 'sante';

const SEGMENTS: Array<{ key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'variables', label: 'Variables', icon: 'basket-outline' },
  { key: 'fixes', label: 'Fixes', icon: 'receipt-outline' },
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

/* ─────────────── Variables : enveloppes de la semaine ─────────────── */

function VariablesTab({ month }: { month: string }) {
  const db = useSQLiteContext();
  const week = currentWeekKey();
  const { data: envelopes } = useLiveQuery((db) => listEnvelopesForMonth(db, month, week), [month, week]);
  const { data: expenses } = useLiveQuery((db) => listExpensesForMonth(db, month, 'week'), [month]);
  const weekly = (envelopes ?? []).filter((e) => e.period === 'week');

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
      <View style={styles.grid}>
        {weekly.map((envelope) => (
          <EnvelopeCard key={envelope.id} envelope={envelope} month={month} />
        ))}
        <AddTile icon="options-outline" label="Gérer mes enveloppes" onPress={() => router.push('/enveloppes')} />
      </View>

      <Heading style={styles.sectionTitle}>Dernières dépenses</Heading>
      <ExpenseList
        expenses={expenses ?? []}
        empty="Note chaque achat dès que tu le fais : ton reste se met à jour."
        onDelete={confirmDelete}
      />
    </>
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
          <View style={[styles.ringCenter, { backgroundColor: envelope.color }]}>
            <Ionicons
              name={(envelope.icon in Ionicons.glyphMap ? envelope.icon : 'pricetag-outline') as keyof typeof Ionicons.glyphMap}
              size={30}
              color={theme.colors.onAccent}
            />
          </View>
        </ProgressRing>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.text} style={styles.chevron} />
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
      style={[styles.addTile, { borderColor: theme.colors.border }]}
    >
      <Ionicons name={icon} size={18} color={theme.colors.text} />
      <Body size={14} weight="semibold">
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
  const { data: envelopes } = useLiveQuery(
    (db) => listEnvelopesForMonth(db, month, currentWeekKey()),
    [month],
  );
  const list = (items ?? []).filter((i) => i.kind === kind);
  const postes = (envelopes ?? []).filter((e) => e.period === 'month');
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
      <SectionTitle icon="bar-chart" label={isCharge ? 'Suivi des dépenses' : 'Suivi des revenus'} />
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

      {isCharge ? (
        <View style={styles.chips}>
          {postes.map((poste) => (
            <Pressable
              key={poste.id}
              onPress={() => void openEnvelope(db, poste, 'detail')}
              accessibilityRole="button"
              accessibilityLabel={`${poste.name} : ${formatCents(poste.spent_cents)} sur ${formatCents(poste.budget_cents)}`}
              style={[styles.chip, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            >
              <View style={[styles.chipHead, { backgroundColor: poste.color }]}>
                <Ionicons
                  name={(poste.icon in Ionicons.glyphMap ? poste.icon : 'pricetag-outline') as keyof typeof Ionicons.glyphMap}
                  size={14}
                  color={theme.colors.onAccent}
                />
                <Body size={13} weight="semibold" color={theme.colors.onAccent} numberOfLines={1}>
                  {poste.name}
                </Body>
              </View>
              <View style={styles.chipBody}>
                <Body
                  size={13.5}
                  weight="semibold"
                  tone={poste.spent_cents > poste.budget_cents ? 'danger' : 'text'}
                  numberOfLines={1}
                >
                  {formatCents(poste.spent_cents, { compact: true })}/{formatCents(poste.budget_cents, { compact: true })}
                </Body>
                <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
              </View>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push({ pathname: '/enveloppe', params: { period: 'month', month } })}
            accessibilityRole="button"
            accessibilityLabel="Nouveau poste du mois"
            style={[styles.chip, styles.chipAdd, { borderColor: theme.colors.border }]}
          >
            <Ionicons name="add" size={16} color={theme.colors.textMuted} />
            <Caption>Poste</Caption>
          </Pressable>
        </View>
      ) : null}

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
  ringCenter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexBasis: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexBasis: '31%',
    flexGrow: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chipHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  chipBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
  },
  chipAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderStyle: 'dashed',
    minHeight: 64,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1.5,
  },
});
