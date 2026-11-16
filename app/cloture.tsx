import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Chip } from '@/src/components/ui/Chip';
import { FadeIn } from '@/src/components/ui/FadeIn';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { closeEnvelope, undoClosure, type ClosureAction, type ClosureLine } from '@/src/features/closure/repository';
import {
  ensureMonth,
  resetMonthFromBase,
  resolveEnvelopeId,
  type EnvelopeForMonth,
} from '@/src/features/envelopes/repository';
import {
  closeAllEnvelopes,
  finishHandover,
  getMonthHandover,
  settleLooseEnd,
  startMonthLike,
  type LooseEnd,
  type LooseEndKey,
  type MonthHandover,
} from '@/src/features/handover/repository';
import { listPots, type PotWithBalance } from '@/src/features/savings/repository';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, daysInMonthOf, isoDayInMonth, monthKeyLabel, todayIso } from '@/src/utils/dates';
import { notify } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

type Step = 0 | 1 | 2;
type RestChoice = 'save' | 'carry' | 'leave';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * « Passer au mois suivant » : un seul parcours pour la fin d'un mois et le
 * début du suivant. 1) terminer le mois (tout cocher), 2) ranger les restes
 * en une décision, 3) préparer le plan du mois qui commence.
 *
 * Ouvert avant la fin du mois (`month` = mois en cours), il ne montre que la
 * préparation du mois suivant.
 */
export default function HandoverModal() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ month?: string; step?: string }>();
  const globalMonth = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const month = params.month ?? globalMonth;
  const early = month >= currentMonthKey();
  const [step, setStep] = useState<Step>(early ? 2 : params.step === 'prepare' ? 2 : 0);
  const { data } = useLiveQuery(
    async (db) => ({ handover: await getMonthHandover(db, month), pots: await listPots(db, month) }),
    [month],
  );

  if (!data) return <Screen />;
  const { handover, pots } = data;
  const name = monthKeyLabel(month).split(' ')[0];
  const nextName = monthKeyLabel(handover.next).split(' ')[0];

  const finish = async () => {
    if (early) await ensureMonth(db, handover.next);
    else await finishHandover(db, month);
    if (!early) setMonth(handover.next);
    router.back();
  };

  return (
    <Screen>
      <ModalHeader title={early ? `Préparer ${nextName}` : `Passer à ${nextName}`} />
      {early ? (
        <Caption>
          {cap(name)} n’est pas fini : tu peux déjà regarder le plan de {nextName} et ajuster tes enveloppes. Les restes
          de {name} se rangeront une fois le mois terminé.
        </Caption>
      ) : (
        <Stepper step={step} onChange={setStep} labels={[cap(name), 'Restes', cap(nextName)]} />
      )}

      <FadeIn key={step}>
        {step === 0 ? (
          <FinishStep handover={handover} name={name} onNext={() => setStep(1)} />
        ) : step === 1 ? (
          <RestsStep handover={handover} pots={pots} name={name} nextName={nextName} onNext={() => setStep(2)} />
        ) : (
          <PrepareStep handover={handover} name={name} nextName={nextName} early={early} onFinish={() => void finish()} />
        )}
      </FadeIn>
    </Screen>
  );
}

/* ─────────────── Fil d'étapes ─────────────── */

function Stepper({ step, onChange, labels }: { step: Step; onChange: (s: Step) => void; labels: string[] }) {
  const theme = useTheme();
  return (
    <View style={styles.stepper} accessibilityRole="tablist">
      {labels.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <Pressable
            key={label}
            onPress={() => onChange(i as Step)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Étape ${i + 1} : ${label}`}
            style={styles.stepItem}
          >
            <View style={[styles.stepBar, { backgroundColor: active || done ? theme.colors.primary : theme.colors.border }]} />
            <View style={styles.stepLabel}>
              <View
                style={[
                  styles.stepDot,
                  { backgroundColor: active ? theme.colors.primary : done ? theme.colors.primarySoft : theme.colors.cardMuted },
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={12} color={theme.colors.primary} />
                ) : (
                  <Caption style={{ fontSize: 11 }} color={active ? theme.colors.onPrimary : theme.colors.textMuted}>
                    {i + 1}
                  </Caption>
                )}
              </View>
              <Caption numberOfLines={1} style={{ flexShrink: 1 }} color={active ? theme.colors.text : theme.colors.textMuted}>
                {label}
              </Caption>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ─────────────── 1 · Terminer le mois ─────────────── */

const LOOSE: Record<
  LooseEndKey,
  { icon: keyof typeof Ionicons.glyphMap; one: string; many: string; action: [string, string] }
> = {
  incomes: { icon: 'wallet-outline', one: 'revenu pas encore crédité', many: 'revenus pas encore crédités', action: ['Reçu', 'Tous reçus'] },
  charges: { icon: 'receipt-outline', one: 'facture pas encore cochée', many: 'factures pas encore cochées', action: ['Réglée', 'Toutes réglées'] },
  expenses: { icon: 'card-outline', one: 'dépense à pointer', many: 'dépenses à pointer', action: ['Pointer', 'Tout pointer'] },
  savings: { icon: 'trending-up-outline', one: 'virement d’épargne prévu', many: 'virements d’épargne prévus', action: ['Versé', 'Tous versés'] },
};

function FinishStep({ handover, name, onNext }: { handover: MonthHandover; name: string; onNext: () => void }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const s = handover.summary;
  // Date des virements créés : aujourd'hui, borné au dernier jour du mois clôturé.
  const lastDay = isoDayInMonth(handover.month, daysInMonthOf(handover.month));
  const date = todayIso() < lastDay ? todayIso() : lastDay;
  const settle = (key: LooseEndKey) =>
    settleLooseEnd(db, handover.month, key, date).catch((e) => notify('Impossible', e instanceof Error ? e.message : String(e)));

  return (
    <>
      <Card style={{ gap: spacing.md }}>
        <Eyebrow>{name} en bref</Eyebrow>
        <View>
          <Money cents={s.balance_cents} signed size={32} weight="xbold" tone={s.balance_cents < 0 ? 'danger' : 'text'} />
          <Caption>
            {s.balance_cents < 0 ? 'Tu as dépensé plus que tes revenus.' : 'gardés sur tes revenus ce mois-ci.'}
          </Caption>
        </View>
        <View style={[styles.trio, { borderTopColor: theme.colors.hairline }]}>
          <Mini label="Revenus" cents={s.income_cents} />
          <Mini label="Dépensé" cents={s.expense_cents} />
          <Mini label="Épargné" cents={s.savings_done_cents} />
        </View>
      </Card>

      <SectionHeader title="Encore en attente" />
      {handover.loose.length === 0 ? (
        <Card style={styles.row}>
          <IconDot icon="checkmark-done" color={theme.colors.success} soft={theme.colors.successSoft} />
          <View style={{ flex: 1 }}>
            <Body weight="semibold">Tout est coché et pointé</Body>
            <Caption>Rien ne traîne en {name}.</Caption>
          </View>
        </Card>
      ) : (
        <Card style={styles.listCard}>
          {handover.loose.map((l, i) => (
            <LooseRow key={l.key} loose={l} last={i === handover.loose.length - 1} onSettle={() => void settle(l.key)} />
          ))}
        </Card>
      )}
      {handover.loose.length > 0 ? (
        <Caption>
          Coche seulement ce qui est vraiment passé sur ton compte. Ce que tu laisses reste simplement en attente.
        </Caption>
      ) : null}
      <Button label="Continuer" onPress={onNext} />
    </>
  );
}

function LooseRow({ loose, last, onSettle }: { loose: LooseEnd; last: boolean; onSettle: () => void }) {
  const theme = useTheme();
  const meta = LOOSE[loose.key];
  const more = loose.count - loose.names.length;
  return (
    <View style={[styles.looseRow, !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline }]}>
      <IconDot icon={meta.icon} color={theme.colors.primary} soft={theme.colors.primarySoft} />
      <View style={{ flex: 1 }}>
        <Body weight="semibold" size={14.5}>
          {loose.count} {loose.count === 1 ? meta.one : meta.many}
        </Body>
        <Caption numberOfLines={2}>
          {formatCents(loose.cents)} · {loose.names.join(', ')}
          {more > 0 ? ` et ${more} de plus` : ''}
        </Caption>
      </View>
      <SmallButton label={meta.action[loose.count === 1 ? 0 : 1]} onPress={onSettle} />
    </View>
  );
}

/* ─────────────── 2 · Ranger les restes ─────────────── */

function RestsStep({
  handover,
  pots,
  name,
  nextName,
  onNext,
}: {
  handover: MonthHandover;
  pots: PotWithBalance[];
  name: string;
  nextName: string;
  onNext: () => void;
}) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const net = handover.rest_cents - handover.over_cents;
  const lines = handover.closure.lines;
  const open = lines.filter((l) => !l.closure && l.remainder_cents !== 0);
  const closed = lines.filter((l) => l.closure);
  // Suggestion : un reste se met de côté (s'il y a une cagnotte), un dépassement se reporte.
  const suggested: RestChoice = net > 0 && pots.length > 0 ? 'save' : net < 0 ? 'carry' : pots.length > 0 ? 'save' : 'carry';
  const [choice, setChoice] = useState<RestChoice>(suggested);
  const [potId, setPotId] = useState<number | null>(null);
  const [detail, setDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  // Cagnotte proposée : le projet dont la date limite est la plus proche, sinon le premier projet.
  const pot =
    pots.find((p) => p.id === potId) ??
    [...pots]
      .filter((p) => p.kind === 'projet' && p.deadline && (p.target_cents ?? Infinity) > p.balance_cents)
      .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''))[0] ??
    pots.find((p) => p.kind === 'projet') ??
    pots[0] ??
    null;

  const apply = async () => {
    if (choice === 'leave' || open.length === 0) return onNext();
    setBusy(true);
    try {
      await closeAllEnvelopes(db, { month: handover.month, action: choice, potId: pot?.id, date: todayIso() });
      onNext();
    } catch (error) {
      notify('Clôture impossible', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const act = async (line: ClosureLine, action: ClosureAction) => {
    try {
      await closeEnvelope(db, { envelopeId: line.id, action, potId: pot?.id, date: todayIso() });
    } catch (error) {
      notify('Clôture impossible', error instanceof Error ? error.message : String(error));
    }
  };

  if (!handover.closure.ready || (open.length === 0 && closed.length === 0)) {
    return (
      <>
        <Card style={styles.row}>
          <IconDot icon="checkmark-done" color={theme.colors.success} soft={theme.colors.successSoft} />
          <View style={{ flex: 1 }}>
            <Body weight="semibold">Rien à ranger</Body>
            <Caption>Tes enveloppes de {name} tombent pile : ni reste, ni dépassement.</Caption>
          </View>
        </Card>
        <Button label="Continuer" onPress={onNext} />
      </>
    );
  }

  return (
    <>
      {open.length > 0 ? (
        <>
          <Card style={{ gap: spacing.sm }}>
            <Eyebrow>{net < 0 ? `Dépassement de ${name}` : `Il te reste de ${name}`}</Eyebrow>
            <Money cents={Math.abs(net)} size={32} weight="xbold" tone={net < 0 ? 'danger' : 'text'} />
            <Caption>
              {open.map((l) => `${l.name} ${formatCents(l.remainder_cents, { signed: true })}`).join(' · ')}
            </Caption>
            {handover.closure.weeks_saved_cents > 0 ? (
              <Caption>Déjà mis de côté en fin de semaine : {formatCents(handover.closure.weeks_saved_cents)}.</Caption>
            ) : null}
          </Card>

          <SectionHeader title="Qu’en fais-tu ?" />
          {pots.length > 0 ? (
            <ChoiceCard
              icon="trending-up-outline"
              title={net < 0 ? 'Couvrir avec mon épargne' : 'Mettre de côté'}
              subtitle={
                net < 0
                  ? `${formatCents(-net)} sortent de la cagnotte ${pot?.name ?? ''}.`
                  : `${formatCents(net)} de plus dans la cagnotte ${pot?.name ?? ''}.`
              }
              selected={choice === 'save'}
              suggested={suggested === 'save'}
              onPress={() => setChoice('save')}
            >
              {choice === 'save' && pots.length > 1 ? (
                <View style={styles.chips}>
                  {pots.map((p) => (
                    <Chip key={p.id} label={p.name} selected={p.id === pot?.id} onPress={() => setPotId(p.id)} color={p.color} />
                  ))}
                </View>
              ) : null}
            </ChoiceCard>
          ) : null}
          <ChoiceCard
            icon="arrow-forward-circle-outline"
            title={`Reporter sur ${nextName}`}
            subtitle={
              net < 0
                ? `Tes enveloppes de ${nextName} auront d’autant moins.`
                : `Tes enveloppes de ${nextName} auront d’autant plus.`
            }
            selected={choice === 'carry'}
            suggested={suggested === 'carry'}
            onPress={() => setChoice('carry')}
          />
          <ChoiceCard
            icon="card-outline"
            title="Laisser sur mon compte"
            subtitle="Rien ne bouge : c’est simplement dans ton solde."
            selected={choice === 'leave'}
            onPress={() => setChoice('leave')}
          />
          <Button label={choice === 'leave' ? 'Continuer' : 'Valider et continuer'} onPress={() => void apply()} loading={busy} />
          <Pressable onPress={() => setDetail(!detail)} accessibilityRole="button" hitSlop={8}>
            <Caption tone="primary" style={{ textAlign: 'center' }}>
              {detail ? 'Masquer le détail' : 'Choisir enveloppe par enveloppe'}
            </Caption>
          </Pressable>
          {detail ? open.map((l) => <LineCard key={l.id} line={l} pot={pot} nextName={nextName} onAct={act} />) : null}
        </>
      ) : null}

      {closed.length > 0 ? (
        <>
          <SectionHeader title="Déjà rangé" />
          <Card style={styles.listCard}>
            {closed.map((l, i) => (
              <ClosedRow key={l.id} line={l} nextName={nextName} last={i === closed.length - 1} onUndo={() => void undoClosure(db, l.id)} />
            ))}
          </Card>
        </>
      ) : null}
      {open.length === 0 ? <Button label="Continuer" onPress={onNext} /> : null}
    </>
  );
}

function ChoiceCard({
  icon,
  title,
  subtitle,
  selected,
  suggested,
  onPress,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  selected: boolean;
  suggested?: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? theme.colors.primarySoft : theme.colors.card,
          borderColor: selected ? theme.colors.primary : theme.dark ? theme.colors.border : 'transparent',
        },
      ]}
    >
      <View style={styles.row}>
        <IconDot icon={icon} color={theme.colors.primary} soft={selected ? theme.colors.card : theme.colors.primarySoft} />
        <View style={{ flex: 1 }}>
          <View style={[styles.row, { gap: spacing.sm }]}>
            <Body weight="semibold" style={{ flexShrink: 1 }}>
              {title}
            </Body>
            {suggested ? (
              <View style={[styles.tag, { backgroundColor: theme.colors.successSoft }]}>
                <Caption style={{ fontSize: 11 }} color={theme.colors.success}>
                  Conseillé
                </Caption>
              </View>
            ) : null}
          </View>
          <Caption>{subtitle}</Caption>
        </View>
        <Ionicons
          name={selected ? 'radio-button-on' : 'radio-button-off'}
          size={22}
          color={selected ? theme.colors.primary : theme.colors.textMuted}
        />
      </View>
      {children}
    </Pressable>
  );
}

function LineCard({
  line,
  pot,
  nextName,
  onAct,
}: {
  line: ClosureLine;
  pot: PotWithBalance | null;
  nextName: string;
  onAct: (line: ClosureLine, action: ClosureAction) => Promise<void>;
}) {
  const over = line.remainder_cents < 0;
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={styles.row}>
        <CategoryIcon icon={line.icon} color={line.color} size={36} />
        <View style={{ flex: 1 }}>
          <Body weight="semibold">{line.name}</Body>
          <Caption tone={over ? 'danger' : 'muted'}>{over ? 'Dépassé de' : 'Reste'}</Caption>
        </View>
        <Money cents={Math.abs(line.remainder_cents)} size={17} weight="bold" tone={over ? 'danger' : 'text'} />
      </View>
      <View style={styles.actions}>
        {pot ? (
          <SmallButton label={over ? `Couvrir (${pot.name})` : `Mettre de côté (${pot.name})`} onPress={() => void onAct(line, over ? 'cover' : 'save')} grow />
        ) : null}
        <SmallButton label={`Reporter sur ${nextName}`} onPress={() => void onAct(line, 'carry')} grow />
      </View>
    </Card>
  );
}

function ClosedRow({ line, nextName, last, onUndo }: { line: ClosureLine; nextName: string; last: boolean; onUndo: () => void }) {
  const theme = useTheme();
  const c = line.closure!;
  const status =
    c.action === 'save'
      ? `Mis de côté · ${c.pot_name ?? 'cagnotte'}`
      : c.action === 'cover'
        ? `Couvert par ${c.pot_name ?? 'une cagnotte'}`
        : `Reporté sur ${nextName}`;
  return (
    <View style={[styles.looseRow, !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline }]}>
      <CategoryIcon icon={line.icon} color={line.color} size={36} />
      <View style={{ flex: 1 }}>
        <Body weight="semibold" size={14.5}>
          {line.name} · {formatCents(c.amount_cents, { signed: true })}
        </Body>
        <Caption color={theme.colors.success}>✓ {status}</Caption>
      </View>
      <Pressable onPress={onUndo} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Annuler pour ${line.name}`}>
        <Caption tone="primary">Annuler</Caption>
      </Pressable>
    </View>
  );
}

/* ─────────────── 3 · Préparer le mois suivant ─────────────── */

function PrepareStep({
  handover,
  name,
  nextName,
  early,
  onFinish,
}: {
  handover: MonthHandover;
  name: string;
  nextName: string;
  early: boolean;
  onFinish: () => void;
}) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const s = handover.next_summary;
  const left = s.plan_left_cents;
  const envelopes = handover.next_envelopes;
  const envelopesBudget = s.variables_budget_cents + s.postes_budget_cents;

  const edit = async (envelope: EnvelopeForMonth) => {
    const id = await resolveEnvelopeId(db, envelope);
    if (id) router.push({ pathname: '/enveloppe', params: { id: String(id), month: handover.next } });
  };

  return (
    <>
      <Card style={{ gap: spacing.sm }}>
        <Eyebrow>Plan de {nextName}</Eyebrow>
        <PlanLine label="Revenus prévus" cents={s.income_cents} />
        <PlanLine label="Factures et charges fixes" cents={-s.charges_cents} />
        <PlanLine label="Enveloppes" cents={-envelopesBudget} />
        <PlanLine label="Épargne programmée" cents={-s.savings_planned_cents} />
        <View style={[styles.total, { borderTopColor: theme.colors.hairline }]}>
          <Body weight="bold" style={{ flex: 1 }}>
            {left < 0 ? 'Il manque' : 'Reste à répartir'}
          </Body>
          <Money cents={Math.abs(left)} size={22} weight="xbold" tone={left < 0 ? 'danger' : 'text'} />
        </View>
        <View style={[styles.note, { backgroundColor: left < 0 ? theme.colors.dangerSoft : theme.colors.successSoft }]}>
          <Ionicons
            name={left < 0 ? 'alert-circle' : 'checkmark-circle'}
            size={18}
            color={left < 0 ? theme.colors.danger : theme.colors.success}
          />
          <Body size={13.5} color={left < 0 ? theme.colors.danger : theme.colors.success} style={{ flex: 1 }}>
            {left < 0
              ? `Ton plan dépasse tes revenus de ${formatCents(-left)} : baisse une enveloppe ou un versement.`
              : left === 0
                ? 'Chaque euro a sa place : ton plan est à l’équilibre.'
                : `Ton plan tient. ${formatCents(left)} n’ont pas encore de place (enveloppe ou cagnotte).`}
          </Body>
        </View>
      </Card>

      {handover.amounts_differ ? (
        <Card style={{ gap: spacing.sm }}>
          <Body weight="semibold">Tes montants ont changé en {name}</Body>
          <Caption>
            {cap(nextName)} part de ta base. Tu peux reprendre les montants de {name} à la place — les reports sont gardés.
          </Caption>
          <View style={styles.actions}>
            <SmallButton label={`Comme en ${name}`} onPress={() => void startMonthLike(db, handover.next, handover.month)} grow />
            {handover.next_ready ? (
              <SmallButton label="Revenir à ma base" onPress={() => void resetMonthFromBase(db, handover.next)} grow />
            ) : null}
          </View>
        </Card>
      ) : null}

      <SectionHeader title={`Enveloppes de ${nextName}`} />
      <Card style={styles.listCard}>
        {envelopes.map((e, i) => (
          <Pressable
            key={e.id}
            onPress={() => void edit(e)}
            accessibilityRole="button"
            accessibilityLabel={`Modifier ${e.name}`}
            style={({ pressed }) => [
              styles.looseRow,
              i < envelopes.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline },
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <CategoryIcon icon={e.icon} color={e.color} size={36} />
            <View style={{ flex: 1 }}>
              <Body weight="semibold" size={14.5}>
                {e.name}
              </Body>
              <Caption>
                {formatCents(e.weekly_cents, { compact: true })} {e.period === 'week' ? 'par semaine' : 'ce mois-ci'}
                {e.adjust_cents !== 0 ? ` · ${formatCents(e.adjust_cents, { signed: true })} reportés` : ''}
              </Caption>
            </View>
            <Money cents={e.budget_cents} size={15} weight="semibold" />
            <Ionicons name="create-outline" size={16} color={theme.colors.textMuted} />
          </Pressable>
        ))}
        {envelopes.length === 0 ? <Caption style={{ padding: spacing.md }}>Aucune enveloppe dans ta base.</Caption> : null}
      </Card>
      <View style={styles.actions}>
        <SmallButton
          label="+ Enveloppe"
          onPress={() => router.push({ pathname: '/enveloppe', params: { month: handover.next, period: 'month' } })}
          grow
        />
        <SmallButton
          label="+ Revenu"
          onPress={() => router.push({ pathname: '/fixe', params: { month: handover.next, kind: 'income' } })}
          grow
        />
        <SmallButton
          label="+ Facture"
          onPress={() => router.push({ pathname: '/fixe', params: { month: handover.next, kind: 'charge' } })}
          grow
        />
      </View>

      <Button label={early ? `${cap(nextName)} est prêt` : `C’est parti pour ${nextName}`} onPress={onFinish} />
      {!early && handover.closure.done ? (
        <Caption style={{ textAlign: 'center' }}>Le passage de {name} est déjà terminé.</Caption>
      ) : null}
    </>
  );
}

/* ─────────────── Petits éléments ─────────────── */

function PlanLine({ label, cents }: { label: string; cents: number }) {
  return (
    <View style={styles.row}>
      <Body style={{ flex: 1 }}>{label}</Body>
      <Money cents={cents} signed size={15} weight="semibold" />
    </View>
  );
}

function Mini({ label, cents }: { label: string; cents: number }) {
  return (
    <View style={{ flex: 1 }}>
      <Caption>{label}</Caption>
      <Money cents={cents} size={15} weight="semibold" />
    </View>
  );
}

function IconDot({ icon, color, soft }: { icon: keyof typeof Ionicons.glyphMap; color: string; soft: string }) {
  return (
    <View style={[styles.dot, { backgroundColor: soft }]}>
      <Ionicons name={icon} size={19} color={color} />
    </View>
  );
}

function SmallButton({ label, onPress, grow }: { label: string; onPress: () => void; grow?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.small,
        grow && { flexGrow: 1 },
        { backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Body size={13.5} weight="semibold" color={theme.colors.primary} style={{ textAlign: 'center' }}>
        {label}
      </Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  listCard: { paddingVertical: spacing.xs },
  looseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  trio: { flexDirection: 'row', gap: spacing.md, borderTopWidth: 1, paddingTop: spacing.md },
  total: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingTop: spacing.md, marginTop: spacing.xs },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  dot: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  small: { paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.full },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  choice: { borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.lg },
  stepper: { flexDirection: 'row', gap: spacing.sm },
  stepItem: { flex: 1, gap: 6 },
  stepBar: { height: 4, borderRadius: 2 },
  stepLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
