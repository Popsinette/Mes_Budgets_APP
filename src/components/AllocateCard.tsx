import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { applyAllocation, getAllocation, type AllocationReason } from '@/src/features/coach/repository';
import { spacing, useTheme } from '@/src/theme';
import { monthKeyLabel, type MonthKey } from '@/src/utils/dates';
import { notify } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

const REASON: Record<AllocationReason, string> = {
  late: 'En retard sur sa date : de quoi revenir dans les temps',
  safety: 'Ta sécurité : le reste va ici',
  goal: 'Objectif en cours : tu y arrives plus vite',
};

/**
 * « Placer mon reste » : l'argent du mois qui n'a pas de place, réparti entre
 * les objectifs en retard, la sécurité puis les autres objectifs. Un toucher
 * ajoute ces montants aux virements de ce mois-ci (pas aux mois suivants).
 */
export function AllocateCard({ month }: { month: MonthKey }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);
  const { data } = useLiveQuery((db) => getAllocation(db, month), [month]);
  if (!data || data.lines.length === 0) return null;
  const name = monthKeyLabel(month).split(' ')[0];
  const placed = data.lines.reduce((s, l) => s + l.extra_cents, 0);

  const apply = async () => {
    setBusy(true);
    try {
      const total = await applyAllocation(db, month);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify('C’est planifié', `${formatCents(total)} ajoutés à tes virements de ${name}. Pointe-les dans Cagnottes une fois faits.`);
    } catch (error) {
      notify('Impossible', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <Eyebrow>Placer mon reste</Eyebrow>
      <Body size={14.5}>
        <Body weight="bold" size={14.5}>
          {formatCents(data.free_cents)}
        </Body>{' '}
        de {name} n’ont pas encore de place. Voici où ils seraient le plus utiles :
      </Body>
      {data.lines.map((line) => (
        <View key={line.pot.id} style={[styles.row, { borderTopColor: theme.colors.hairline }]}>
          <CategoryIcon icon={line.pot.icon} color={line.pot.color} size={36} />
          <View style={{ flex: 1 }}>
            <Body weight="semibold" size={14.5}>
              {line.pot.name}
            </Body>
            <Caption>{REASON[line.reason]}</Caption>
          </View>
          <Money cents={line.extra_cents} signed size={15} weight="bold" />
        </View>
      ))}
      <Button label={`Planifier ${formatCents(placed, { compact: true })} de virements`} onPress={() => void apply()} loading={busy} />
      <Caption>
        Seul {name} change : tes versements habituels restent les mêmes.
        {data.left_cents > 0 ? ` Il restera ${formatCents(data.left_cents)} sans place.` : ''}
      </Caption>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1 },
});
