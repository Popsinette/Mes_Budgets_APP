import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { FadeIn } from '@/src/components/ui/FadeIn';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { checkPurchase, createWishPot, type PurchaseCheck } from '@/src/features/coach/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, monthKeyLabel } from '@/src/utils/dates';
import { notify } from '@/src/utils/dialogs';
import { formatCents, parseAmountToCents } from '@/src/utils/money';

const QUICK = [2000, 5000, 10000, 30000];

/**
 * « Puis-je me le permettre ? » : on tape un montant, l'app répond avec les
 * chiffres du plan — une enveloppe a la place, sinon l'argent sans place du
 * mois, sinon l'épargne, sinon combien de mois attendre (et en faire un
 * objectif d'un toucher).
 */
export default function AffordModal() {
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const cents = parseAmountToCents(amount) ?? 0;
  const { data } = useLiveQuery(async (db) => (cents > 0 ? checkPurchase(db, cents) : null), [cents]);

  return (
    <Screen>
      <ModalHeader title="Puis-je me le permettre ?" />
      <Caption>Tape le prix d’une envie : la réponse suit ton plan, tes enveloppes et tes cagnottes.</Caption>
      <AmountField label="Combien ça coûte ?" value={amount} onChangeText={setAmount} placeholder="0,00" autoFocus />
      <View style={styles.quick}>
        {QUICK.map((q) => (
          <QuickChip key={q} label={formatCents(q, { compact: true })} onPress={() => setAmount(String(q / 100))} />
        ))}
      </View>
      <FormField label="C’est pour quoi ? (facultatif)" value={name} onChangeText={setName} placeholder="Vélo, week-end, téléphone…" />
      {data ? (
        <FadeIn key={`${data.verdict}-${cents}`}>
          <Answer check={data} name={name} />
        </FadeIn>
      ) : null}
    </Screen>
  );
}

function Answer({ check, name }: { check: PurchaseCheck; name: string }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const month = monthKeyLabel(currentMonthKey()).split(' ')[0];
  const fit = check.envelopes.filter((e) => e.fits);
  const price = formatCents(check.amount_cents);

  const tone =
    check.verdict === 'envelope' || check.verdict === 'plan'
      ? { soft: theme.colors.successSoft, ink: theme.colors.success, icon: 'checkmark-circle' as const }
      : check.verdict === 'savings'
        ? { soft: theme.colors.warningSoft, ink: theme.colors.warning, icon: 'alert-circle' as const }
        : { soft: theme.colors.dangerSoft, ink: theme.colors.danger, icon: 'time' as const };
  const title =
    check.verdict === 'envelope'
      ? 'Oui, c’est dans ton budget'
      : check.verdict === 'plan'
        ? 'Oui, sans toucher à tes enveloppes'
        : check.verdict === 'savings'
          ? 'Pas avec ton budget du mois'
          : check.months_to_wait === null
            ? 'Pas pour l’instant'
            : `Pas encore : dans ${check.months_to_wait} mois`;
  const text =
    check.verdict === 'envelope'
      ? `${fit[0].name} a encore ${formatCents(fit[0].left_cents)} : il t’y restera ${formatCents(fit[0].left_cents - check.amount_cents)} après l’achat.`
      : check.verdict === 'plan'
        ? `Aucune enveloppe n’a ${price}, mais ${formatCents(check.free_cents)} de ${month} n’ont pas encore de place. Il t’en restera ${formatCents(check.free_cents - check.amount_cents)}.`
        : check.verdict === 'savings'
          ? `Ni tes enveloppes ni le reste de ${month} (${formatCents(check.free_cents)}) ne couvrent ${price}. Ton épargne le peut — à toi de voir si ça vaut le coup.`
          : check.months_to_wait === null
            ? `Ton plan ne laisse rien de libre en ce moment. Baisse une enveloppe ou un versement pour dégager de quoi mettre de côté.`
            : `En mettant de côté ce que ton plan laisse libre (${formatCents(check.monthly_free_cents)} par mois en moyenne), tu l’auras en ${monthKeyLabel(check.ready_month!)}.`;

  const makeGoal = async () => {
    try {
      await createWishPot(db, {
        name,
        targetCents: check.amount_cents,
        monthlyCents: Math.ceil(check.amount_cents / Math.max(1, check.months_to_wait!) / 100) * 100,
        readyMonth: check.ready_month!,
      });
      notify('Objectif créé', 'Ta nouvelle cagnotte est dans l’onglet Cagnottes, avec son versement mensuel.');
      router.back();
    } catch (error) {
      notify('Impossible', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <View style={[styles.verdict, { backgroundColor: tone.soft }]}>
        <Ionicons name={tone.icon} size={26} color={tone.ink} />
        <View style={{ flex: 1, gap: 2 }}>
          <Body weight="bold" size={16.5} color={tone.ink}>
            {title}
          </Body>
          <Body size={14} color={theme.colors.text}>
            {text}
          </Body>
        </View>
      </View>

      {check.verdict === 'envelope' ? (
        <Card style={styles.list}>
          <Eyebrow style={{ paddingTop: spacing.sm }}>Enveloppes qui ont la place</Eyebrow>
          {fit.map((e, i) => (
            <Pressable
              key={e.id}
              onPress={() => router.replace({ pathname: '/depense', params: { envelopeId: String(e.id) } })}
              accessibilityRole="button"
              accessibilityLabel={`Noter la dépense dans ${e.name}`}
              style={({ pressed }) => [
                styles.row,
                i < fit.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline },
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <CategoryIcon icon={e.icon} color={e.color} size={36} />
              <View style={{ flex: 1 }}>
                <Body weight="semibold" size={14.5}>
                  {e.name}
                </Body>
                <Caption>Reste {formatCents(e.left_cents - check.amount_cents)} après l’achat</Caption>
              </View>
              <Caption tone="primary">Noter</Caption>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      {check.verdict === 'plan' ? (
        <Button
          label="Créer une enveloppe pour cet achat"
          variant="secondary"
          onPress={() => router.replace({ pathname: '/enveloppe', params: { month: currentMonthKey(), period: 'month' } })}
        />
      ) : null}

      {check.verdict === 'savings' ? (
        <Card style={styles.list}>
          <Eyebrow style={{ paddingTop: spacing.sm }}>Cagnottes qui peuvent payer</Eyebrow>
          {check.pots.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() =>
                router.replace({
                  pathname: '/mouvement',
                  params: { potId: String(p.id), type: 'withdraw', amount: String(check.amount_cents) },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Retirer de ${p.name}`}
              style={({ pressed }) => [
                styles.row,
                i < check.pots.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline },
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <CategoryIcon icon={p.icon} color={p.color} size={36} />
              <View style={{ flex: 1 }}>
                <Body weight="semibold" size={14.5}>
                  {p.name}
                </Body>
                <Caption tone={p.goal ? 'warning' : 'muted'}>
                  {p.safety ? 'Ta sécurité · ' : p.goal ? 'Retarde son objectif · ' : ''}il y restera {formatCents(p.balance_cents - check.amount_cents)}
                </Caption>
              </View>
              <Money cents={p.balance_cents} size={14.5} weight="semibold" />
            </Pressable>
          ))}
        </Card>
      ) : null}

      {check.verdict !== 'envelope' && check.verdict !== 'plan' && check.months_to_wait !== null && check.months_to_wait > 0 ? (
        <Card style={{ gap: spacing.sm }}>
          <Eyebrow>{check.verdict === 'savings' ? 'Ou sans toucher à ton épargne' : 'Fais-en un objectif'}</Eyebrow>
          <Body size={14}>
            Une cagnotte{name.trim() ? ` « ${name.trim()} »` : ''} de {price}, alimentée de{' '}
            {formatCents(Math.ceil(check.amount_cents / check.months_to_wait / 100) * 100, { compact: true })} par mois : prête en{' '}
            {monthKeyLabel(check.ready_month!)}.
          </Body>
          <Button label="Créer cet objectif" onPress={() => void makeGoal()} />
        </Card>
      ) : null}
    </>
  );
}

function QuickChip({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.chip, { backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.7 : 1 }]}
    >
      <Body size={13.5} weight="semibold" color={theme.colors.primary}>
        {label}
      </Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', gap: spacing.sm },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.full },
  verdict: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg },
  list: { paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
});
