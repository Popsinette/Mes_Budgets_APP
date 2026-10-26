import { useSQLiteContext } from 'expo-sqlite';
import { StyleSheet, View } from 'react-native';
import { GoalHint } from '@/src/components/GoalHint';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { FREQUENCY_LABELS, getAnnualCharges, type AnnualCharge } from '@/src/features/fixed/repository';
import {
  createProvisionPot,
  goalAdvice,
  listPots,
  setPotMonthly,
  type PotWithBalance,
} from '@/src/features/savings/repository';
import { categoryPalette, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, isoDayInMonth, monthKeyLabel, shiftMonthKey } from '@/src/utils/dates';
import { notify } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

const STEP = { quarterly: 3, yearly: 12 } as const;

/**
 * « Mon année » : les grosses charges qui ne tombent pas tous les mois
 * (assurance annuelle, impôts, eau au trimestre…) et ce qu'il faut mettre de
 * côté chaque mois pour ne plus être surprise ; « Lisser avec une cagnotte »
 * crée la cagnotte de provision. Puis les projets datés (cagnottes avec date
 * limite) et leur versement nécessaire.
 */
export default function YearModal() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const month = currentMonthKey();
  const { data } = useLiveQuery(
    async (db) => ({ charges: await getAnnualCharges(db, month), pots: await listPots(db, month) }),
    [month],
  );
  if (!data) return <Screen />;
  const { charges, pots } = data;
  const provision = charges.reduce((s, c) => s + c.monthly_provision_cents, 0);
  const yearly = charges.reduce((s, c) => s + c.yearly_cents, 0);
  const dated = pots.filter((p) => p.deadline && p.target_cents);
  const potByName = new Map(pots.map((p) => [p.name, p]));

  const lisser = async (c: AnnualCharge) => {
    // Échéance de ce mois-ci : on prépare la suivante.
    const dueMonth = c.months_until === 0 ? shiftMonthKey(c.next_month, STEP[c.frequency as keyof typeof STEP]) : c.next_month;
    await createProvisionPot(db, {
      name: c.name,
      amountCents: c.amount_cents,
      dueDate: isoDayInMonth(dueMonth, c.day),
      fromMonth: month,
      color: categoryPalette[(pots.length + 3) % categoryPalette.length],
    });
    notify('Cagnotte créée', `« Provision ${c.name} » : à verser chaque mois jusqu’à l’échéance, puis à retirer pour payer.`);
  };

  return (
    <Screen>
      <ModalHeader title="Mon année" />
      <Card style={[styles.hero, { backgroundColor: theme.colors.primarySoft }]}>
        <Caption tone="text">À mettre de côté chaque mois pour les grosses charges</Caption>
        <Money cents={provision} size={30} weight="xbold" color={theme.colors.primary} />
        <Caption>
          {charges.length > 0
            ? `pour ${formatCents(yearly)} de charges non mensuelles par an — elles ne te surprendront plus.`
            : 'Aucune charge trimestrielle ou annuelle pour l’instant.'}
        </Caption>
      </Card>

      <SectionHeader title="Charges à lisser" />
      {charges.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar-outline"
            title="Rien à lisser"
            subtitle="Ajoute une charge « Tous les ans » ou « Tous les 3 mois » (assurance, impôts, eau…) avec le bouton +."
          />
        </Card>
      ) : (
        charges.map((c) => {
          const pot = potByName.get(`Provision ${c.name}`);
          return (
            <Card key={c.id} style={{ gap: spacing.sm }}>
              <View style={styles.row}>
                <CategoryIcon icon={c.icon ?? 'calendar-outline'} color={theme.colors.navy} size={38} />
                <View style={{ flex: 1 }}>
                  <Body weight="semibold" numberOfLines={1}>
                    {c.name}
                  </Body>
                  <Caption>
                    {FREQUENCY_LABELS[c.frequency]} ·{' '}
                    {c.months_until === 0
                      ? 'ce mois-ci'
                      : `en ${monthKeyLabel(c.next_month)} (dans ${c.months_until} mois)`}
                  </Caption>
                </View>
                <Money cents={c.amount_cents} size={16} weight="bold" />
              </View>
              {pot ? (
                <ProvisionStatus pot={pot} month={month} onAdjust={(cents) => void setPotMonthly(db, pot.id, cents)} />
              ) : (
                <View style={styles.row}>
                  <Caption style={{ flex: 1 }}>
                    ≈ {formatCents(c.monthly_provision_cents, { compact: true })} par mois pour la lisser
                  </Caption>
                  <View style={{ minWidth: 190 }}>
                    <Button label="Lisser avec une cagnotte" variant="secondary" onPress={() => void lisser(c)} />
                  </View>
                </View>
              )}
            </Card>
          );
        })
      )}

      <SectionHeader title="Mes projets datés" />
      {dated.length === 0 ? (
        <Caption>Donne une date limite et un objectif à une cagnotte (Noël, vacances…) pour la suivre ici.</Caption>
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {dated.map((p, i) => (
            <View key={p.id} style={[styles.project, i > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.hairline }]}>
              <View style={styles.row}>
                <CategoryIcon icon={p.icon} color={p.color} size={34} />
                <Body weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                  {p.name}
                </Body>
                <Money cents={p.balance_cents} size={14.5} weight="semibold" />
                <Caption>/ {formatCents(p.target_cents ?? 0, { compact: true })}</Caption>
              </View>
              <GoalHint pot={p} advice={goalAdvice(p, month)} onAdjust={(cents) => void setPotMonthly(db, p.id, cents)} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function ProvisionStatus({ pot, month, onAdjust }: { pot: PotWithBalance; month: string; onAdjust: (cents: number) => void }) {
  return (
    <View style={{ gap: 2 }}>
      <Caption tone="success">
        ✓ Cagnotte « {pot.name} » : {formatCents(pot.balance_cents)} mis de côté
        {pot.monthly_cents ? ` · ${formatCents(pot.monthly_cents, { compact: true })}/mois` : ''}
      </Caption>
      <GoalHint pot={pot} advice={goalAdvice(pot, month)} onAdjust={onAdjust} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  project: { gap: 6, paddingVertical: spacing.md },
});
