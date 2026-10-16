import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { AmountField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  getAccountStatus,
  setAccountBalance,
  startLabel,
  type AccountStatus,
} from '@/src/features/account/repository';
import { searchExpenses, type Expense } from '@/src/features/envelopes/repository';
import { listFixedForMonth, type FixedItemForMonth } from '@/src/features/fixed/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, monthKeyLabel, numericDate, todayIso } from '@/src/utils/dates';
import { notify } from '@/src/utils/dialogs';
import { formatCents, parseAmountToCents } from '@/src/utils/money';

/**
 * « Mon compte » : saisie du solde bancaire, solde estimé, fin de mois prévue
 * et comparaison avec la banque.
 */
export default function AccountModal() {
  const { data: status, loading } = useLiveQuery((db) => getAccountStatus(db));
  const [editing, setEditing] = useState(false);
  if (loading) return <Screen />;
  if (!status || editing) {
    return <BalanceForm initial={status ?? null} onDone={() => (status ? setEditing(false) : router.back())} />;
  }
  return <AccountDetail status={status} onEdit={() => setEditing(true)} />;
}

/* ───────────── Saisie du solde ───────────── */

function BalanceForm({ initial, onDone }: { initial: AccountStatus | null; onDone: () => void }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const month = currentMonthKey();
  const today = new Date().getDate();
  const { data: items } = useLiveQuery((db) => listFixedForMonth(db, month), [month]);
  const unchecked = (items ?? []).filter((i) => !i.checked);
  const [amount, setAmount] = useState('');
  // Par défaut : ce dont l'échéance est passée est sans doute déjà sur le compte.
  const [passed, setPassed] = useState<Set<number> | null>(null);
  const selected = passed ?? new Set(unchecked.filter((i) => i.day <= today).map((i) => i.id));
  const [saving, setSaving] = useState(false);
  const { data: uncleared } = useLiveQuery((db) => searchExpenses(db, { month: null, query: '', unclearedOnly: true }));
  const pendingExpenses = uncleared ?? [];
  // Par défaut : une dépense d'avant aujourd'hui est sans doute déjà débitée.
  const [debited, setDebited] = useState<Set<number> | null>(null);
  const debitedIds = debited ?? new Set(pendingExpenses.filter((x) => x.date < todayIso()).map((x) => x.id));
  const toggleExpense = (expense: Expense) => {
    const next = new Set(debitedIds);
    if (next.has(expense.id)) next.delete(expense.id);
    else next.add(expense.id);
    setDebited(next);
  };

  const toggle = (item: FixedItemForMonth) => {
    const next = new Set(selected);
    if (next.has(item.id)) next.delete(item.id);
    else next.add(item.id);
    setPassed(next);
  };

  const save = async () => {
    const trimmed = amount.trim();
    const negative = trimmed.startsWith('-') || trimmed.startsWith('−');
    const cents = parseAmountToCents(negative ? trimmed.slice(1) : trimmed);
    if (cents === null) {
      notify('Montant invalide', 'Saisis le solde affiché par ta banque, par exemple 1250,40 (ou -45 si découvert).');
      return;
    }
    setSaving(true);
    await setAccountBalance(
      db,
      negative ? -cents : cents,
      unchecked.filter((i) => selected.has(i.id)).map((i) => ({ itemId: i.id, month })),
      pendingExpenses.filter((x) => debitedIds.has(x.id)).map((x) => x.id),
    );
    setSaving(false);
    onDone();
  };

  return (
    <Screen>
      <ModalHeader title={initial ? 'Modifier mon solde' : 'Mon compte'} />
      <Caption>
        Ouvre l’appli de ta banque et recopie le solde de ton compte courant. Ensuite, l’app le tient à jour avec ce
        que tu notes et coches.
      </Caption>
      <AmountField label="Solde actuel de mon compte" value={amount} onChangeText={setAmount} placeholder="1 250,00" autoFocus />

      {unchecked.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Déjà passé sur ton compte en {monthKeyLabel(month).split(' ')[0]} ?</Eyebrow>
          <Caption>
            Coche ce qui est déjà inclus dans ce solde, pour ne pas le compter deux fois. Le reste sera compté quand tu le
            cocheras.
          </Caption>
          <Card style={{ paddingVertical: spacing.xs }}>
            {unchecked.map((item, i) => {
              const on = selected.has(item.id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggle(item)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${item.name} déjà passé`}
                  style={[
                    styles.row,
                    i < unchecked.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline },
                  ]}
                >
                  <Ionicons
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={on ? theme.colors.secondary : theme.colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Body weight="medium">{item.name}</Body>
                    <Caption>Le {item.day} du mois</Caption>
                  </View>
                  <Money
                    cents={item.kind === 'income' ? item.amount_cents : -item.amount_cents}
                    signed
                    size={14.5}
                    tone={item.kind === 'income' ? 'text' : 'expense'}
                  />
                </Pressable>
              );
            })}
          </Card>
        </View>
      ) : null}

      {pendingExpenses.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Dépenses déjà débitées ?</Eyebrow>
          <Caption>
            Coche les dépenses notées qui apparaissent déjà sur ton compte : elles seront pointées. Les autres restent « à
            pointer ».
          </Caption>
          <Card style={{ paddingVertical: spacing.xs }}>
            {pendingExpenses.map((x, i) => {
              const on = debitedIds.has(x.id);
              return (
                <Pressable
                  key={x.id}
                  onPress={() => toggleExpense(x)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${x.label} déjà débitée`}
                  style={[
                    styles.row,
                    i < pendingExpenses.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline },
                  ]}
                >
                  <Ionicons
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={on ? theme.colors.secondary : theme.colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Body weight="medium">{x.label}</Body>
                    <Caption>
                      {x.envelope_name} · {numericDate(x.date)}
                    </Caption>
                  </View>
                  <Money cents={-x.amount_cents} signed size={14.5} tone="expense" />
                </Pressable>
              );
            })}
          </Card>
        </View>
      ) : null}

      <Button label="Enregistrer mon solde" onPress={() => void save()} loading={saving} />
      {initial ? <Button label="Annuler" variant="secondary" onPress={onDone} /> : null}
    </Screen>
  );
}

/* ───────────── Détail ───────────── */

function AccountDetail({ status, onEdit }: { status: AccountStatus; onEdit: () => void }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [bank, setBank] = useState('');

  const since: Array<[string, number]> = [
    ['Revenus crédités', status.incomes_cents],
    ['Charges réglées', -status.charges_cents],
    ['Dépenses pointées', -status.expenses_cents],
    ['Frais de santé avancés', -status.health_cents],
    ['Remboursements santé', status.refunds_cents],
    ['Virements vers les cagnottes', -status.savings_cents],
  ];
  const upcoming: Array<[string, number]> = [
    ['Revenus à créditer', status.upcoming_incomes_cents],
    ['Charges à débiter', -status.upcoming_charges_cents],
    [
      status.uncleared_count === 1 ? 'Dépense à pointer (1)' : `Dépenses à pointer (${status.uncleared_count})`,
      -status.uncleared_cents,
    ],
    ['Reste des enveloppes', -status.envelopes_left_cents],
    ['Épargne programmée à verser', -status.savings_left_cents],
    ['Remboursements attendus', status.pending_refunds_cents],
  ];

  const trimmed = bank.trim();
  const negative = trimmed.startsWith('-') || trimmed.startsWith('−');
  const bankCents = trimmed ? parseAmountToCents(negative ? trimmed.slice(1) : trimmed) : null;
  const bankValue = bankCents === null ? null : negative ? -bankCents : bankCents;
  const gap = bankValue === null ? null : bankValue - status.balance_cents;

  const end = status.end_of_month_cents;

  return (
    <Screen>
      <ModalHeader title="Mon compte" />

      <View>
        <Eyebrow>Solde estimé maintenant</Eyebrow>
        <Money cents={status.balance_cents} size={40} weight="xbold" tone={status.balance_cents < 0 ? 'danger' : 'text'} />
        <Caption>
          À partir de {formatCents(status.account.start_cents)} saisis le {startLabel(status.account.start_at)}
        </Caption>
      </View>

      <Card style={{ gap: spacing.sm }}>
        <Body weight="semibold">Depuis la saisie du solde</Body>
        <Lines lines={since} />
      </Card>

      <Card style={{ gap: spacing.sm, borderColor: end < 0 ? theme.colors.danger : theme.colors.border }}>
        <View style={styles.between}>
          <Body weight="semibold">Fin de mois prévue</Body>
          <Money cents={end} size={18} weight="bold" tone={end < 0 ? 'danger' : 'text'} />
        </View>
        <Lines lines={upcoming} />
        {status.uncleared_count > 0 ? (
          <Pressable
            onPress={() => router.push({ pathname: '/depenses', params: { pointer: '1' } })}
            accessibilityRole="button"
            accessibilityLabel="Pointer mes dépenses"
            hitSlop={6}
          >
            <Caption tone="primary">Pointer mes dépenses débitées →</Caption>
          </Pressable>
        ) : null}
        <Caption tone={end < 0 ? 'danger' : 'muted'}>
          {end < 0
            ? 'Ton compte passerait à découvert d’ici la fin du mois : réduis une enveloppe ou décale un virement.'
            : 'Ce qu’il devrait rester sur ton compte le dernier jour du mois, si tout se passe comme prévu.'}
        </Caption>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Body weight="semibold">Comment ces chiffres se tiennent</Body>
        <Caption>
          La pastille « Prévisionnel » est le résultat du mois (revenus − dépenses). La fin de mois dépend aussi de ce
          que tu avais sur ton compte au début du mois :
        </Caption>
        <View style={styles.between}>
          <Body size={14} style={{ flex: 1 }}>
            Solde de début de mois (déduit)
          </Body>
          <Money cents={status.implied_start_cents} size={14.5} tone={status.implied_start_cents < 0 ? 'danger' : 'text'} />
        </View>
        <View style={styles.between}>
          <Body size={14} style={{ flex: 1 }}>
            Résultat du mois (pastille)
          </Body>
          <Money cents={status.month_forecast_cents} signed size={14.5} />
        </View>
        {status.extra_savings_cents !== 0 ? (
          <View style={styles.between}>
            <Body size={14} style={{ flex: 1 }}>
              Virements d’épargne hors plan
            </Body>
            <Money cents={-status.extra_savings_cents} signed size={14.5} />
          </View>
        ) : null}
        <View style={[styles.between, { borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingTop: spacing.sm }]}>
          <Body size={14} weight="semibold" style={{ flex: 1 }}>
            Fin de mois prévue
          </Body>
          <Money cents={end} size={14.5} weight="bold" tone={end < 0 ? 'danger' : 'text'} />
        </View>
        <Caption>
          Si ce solde de début de mois ne te paraît pas juste, vérifie les charges et revenus cochés « déjà passés » et
          les dépenses pointées alors qu’elles n’étaient pas encore débitées. « Saisir un nouveau solde » permet de tout
          reprendre.
        </Caption>
      </Card>

      <SectionHeader title="Comparer avec ma banque" />
      <AmountField label="Solde affiché par ma banque" value={bank} onChangeText={setBank} placeholder="1 250,00" />
      {gap !== null ? (
        gap === 0 ? (
          <View style={[styles.verdict, { backgroundColor: theme.colors.successSoft }]}>
            <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
            <Body size={14} color={theme.colors.success} style={{ flex: 1 }}>
              Parfait, ton suivi correspond à ta banque.
            </Body>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <View style={[styles.verdict, { backgroundColor: theme.colors.warningSoft }]}>
              <Ionicons name="alert-circle" size={20} color={theme.colors.warning} />
              <Body size={14} style={{ flex: 1 }}>
                {gap < 0
                  ? `Ta banque affiche ${formatCents(-gap)} de moins : une dépense débitée mais pas encore pointée (ou oubliée), ou une charge passée mais pas encore cochée ?`
                  : `Ta banque affiche ${formatCents(gap)} de plus : une dépense pointée alors qu’elle n’est pas encore débitée, ou un revenu reçu mais pas coché ?`}
              </Body>
            </View>
            {gap < 0 && status.uncleared_count > 0 ? (
              <Button
                label="Pointer mes dépenses débitées"
                variant="secondary"
                onPress={() => router.push({ pathname: '/depenses', params: { pointer: '1' } })}
              />
            ) : null}
            {gap < 0 ? (
              <Button label="Noter une dépense oubliée" variant="secondary" onPress={() => router.push('/depense')} />
            ) : null}
            <Button
              label={`Caler mon solde sur ${formatCents(bankValue ?? 0)}`}
              onPress={() => {
                if (bankValue === null) return;
                void (async () => {
                  await setAccountBalance(db, bankValue);
                  setBank('');
                })();
              }}
            />
            <Caption>
              Caler ton solde repart du montant de ta banque, maintenant. Pointe d’abord les dépenses déjà débitées : celles
              qui restent « à pointer » seront encore retirées de ton compte quand tu les pointeras.
            </Caption>
          </View>
        )
      ) : (
        <Caption>Tape le solde de ton appli bancaire : l’app te dit s’il y a un écart.</Caption>
      )}

      <Button label="Saisir un nouveau solde" variant="secondary" onPress={onEdit} />
    </Screen>
  );
}

function Lines({ lines }: { lines: Array<[string, number]> }) {
  const visible = lines.filter(([, cents]) => cents !== 0);
  if (visible.length === 0) return <Caption>Rien pour l’instant.</Caption>;
  return (
    <>
      {visible.map(([label, cents]) => (
        <View key={label} style={styles.between}>
          <Body size={14} style={{ flex: 1 }}>
            {label}
          </Body>
          <Money cents={cents} signed size={14.5} />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
});
