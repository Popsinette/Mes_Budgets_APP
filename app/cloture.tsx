import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Chip } from '@/src/components/ui/Chip';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  closeEnvelope,
  getMonthClosure,
  setMonthClosureDone,
  undoClosure,
  type ClosureAction,
  type ClosureLine,
} from '@/src/features/closure/repository';
import { listPots, type PotWithBalance } from '@/src/features/savings/repository';
import { useSelectedMonth } from '@/src/store/month';
import { spacing, useTheme } from '@/src/theme';
import { monthKeyLabel, shiftMonthKey, todayIso } from '@/src/utils/dates';
import { notify } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

/**
 * « Clôturer le mois » : pour chaque enveloppe, son reste part dans une
 * cagnotte ou sur le mois suivant ; un dépassement est reporté sur le mois
 * suivant ou couvert par une cagnotte.
 */
export default function ClosureModal() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ month?: string }>();
  const globalMonth = useSelectedMonth((s) => s.month);
  const month = params.month ?? globalMonth;
  const { data } = useLiveQuery(
    async (db) => ({ closure: await getMonthClosure(db, month), pots: await listPots(db, month) }),
    [month],
  );
  const [potId, setPotId] = useState<number | null>(null);

  if (!data) return <Screen />;
  const { closure, pots } = data;
  const name = monthKeyLabel(month).split(' ')[0];
  const nextName = monthKeyLabel(shiftMonthKey(month, 1)).split(' ')[0];
  const pot = pots.find((p) => p.id === potId) ?? pots.find((p) => p.kind === 'projet') ?? pots[0] ?? null;
  const open = closure.lines.filter((l) => l.closure || l.remainder_cents !== 0);
  const even = closure.lines.filter((l) => !l.closure && l.remainder_cents === 0);

  const act = async (line: ClosureLine, action: ClosureAction) => {
    try {
      await closeEnvelope(db, { envelopeId: line.id, action, potId: pot?.id, date: todayIso() });
    } catch (error) {
      notify('Clôture impossible', error instanceof Error ? error.message : String(error));
    }
  };

  const finish = async () => {
    await setMonthClosureDone(db, month, true);
    router.back();
  };

  return (
    <Screen>
      <ModalHeader title={`Clôturer ${name}`} />
      <Caption>
        Pour chaque enveloppe : son reste part dans une cagnotte ou sur {nextName} ; un dépassement est reporté sur{' '}
        {nextName} (tu y dépenseras d’autant moins) ou couvert par une cagnotte. Ce que tu ne clôtures pas reste
        simplement sur ton compte.
      </Caption>
      {closure.weeks_saved_cents > 0 ? (
        <Caption>
          Déjà mis de côté en fin de semaine : {formatCents(closure.weeks_saved_cents)} (déduit des restes ci-dessous).
        </Caption>
      ) : null}

      {!closure.ready ? (
        <Card>
          <EmptyState icon="calendar-outline" title="Rien à clôturer" subtitle={`Aucune dépense notée en ${name}.`} />
        </Card>
      ) : (
        <>
          {pots.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Eyebrow>Cagnotte pour mettre de côté ou couvrir</Eyebrow>
              <View style={styles.chips}>
                {pots.map((p) => (
                  <Chip key={p.id} label={p.name} selected={p.id === pot?.id} onPress={() => setPotId(p.id)} color={p.color} />
                ))}
              </View>
            </View>
          ) : null}

          <SectionHeader title={`Enveloppes de ${name}`} />
          {open.length === 0 ? (
            <Card>
              <EmptyState icon="checkmark-done-outline" title="Tout tombe pile" subtitle="Aucun reste ni dépassement." />
            </Card>
          ) : (
            open.map((line) => (
              <ClosureCard key={line.id} line={line} pot={pot} nextName={nextName} onAct={act} />
            ))
          )}
          {even.length > 0 ? (
            <Caption>Pile au budget : {even.map((l) => l.name).join(', ')}.</Caption>
          ) : null}

          {closure.done ? (
            <Caption style={{ textAlign: 'center' }}>Clôture de {name} terminée.</Caption>
          ) : (
            <Button label={`Terminer la clôture de ${name}`} onPress={() => void finish()} />
          )}
        </>
      )}
    </Screen>
  );
}

function ClosureCard({
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
  const theme = useTheme();
  const db = useSQLiteContext();
  const c = line.closure;
  const amount = c ? c.amount_cents : line.remainder_cents;
  const over = amount < 0;
  const status = c
    ? c.action === 'save'
      ? `Mis de côté dans ${c.pot_name ?? 'une cagnotte'}`
      : c.action === 'cover'
        ? `Couvert par ${c.pot_name ?? 'une cagnotte'}`
        : `Reporté sur ${nextName}`
    : null;

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={styles.row}>
        <CategoryIcon icon={line.icon} color={line.color} size={36} />
        <View style={{ flex: 1 }}>
          <Body weight="semibold">{line.name}</Body>
          <Caption tone={over && !c ? 'danger' : 'muted'}>{over ? 'Dépassé de' : 'Reste'}</Caption>
        </View>
        <Money cents={Math.abs(amount)} size={17} weight="bold" tone={over && !c ? 'danger' : 'text'} />
      </View>
      {c ? (
        <View style={styles.row}>
          <Body size={13.5} weight="medium" color={theme.colors.success} style={{ flex: 1 }}>
            ✓ {status}
          </Body>
          <Pressable
            onPress={() => void undoClosure(db, line.id)}
            accessibilityRole="button"
            accessibilityLabel={`Annuler la clôture de ${line.name}`}
            hitSlop={8}
          >
            <Caption tone="primary">Annuler</Caption>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          {pot ? (
            <View style={{ flex: 1 }}>
              <Button
                label={over ? 'Couvrir par l’épargne' : 'Mettre de côté'}
                variant="secondary"
                onPress={() => void onAct(line, over ? 'cover' : 'save')}
              />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button label={`Reporter sur ${nextName}`} variant="secondary" onPress={() => void onAct(line, 'carry')} />
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
