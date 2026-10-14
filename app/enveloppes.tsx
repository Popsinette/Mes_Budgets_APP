import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  isEnvelopeActive,
  isOneOff,
  listEnvelopesForMonth,
  type EnvelopeForMonth,
} from '@/src/features/envelopes/repository';
import { useSelectedMonth } from '@/src/store/month';
import { spacing, useTheme } from '@/src/theme';
import { currentWeekKey, monthKeyLabel, weeksOfMonth, type MonthKey } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

/**
 * « Mes enveloppes » d'un mois : variables (par semaine) et postes (par mois),
 * avec le montant de CE mois. Toucher une ligne ouvre sa modification ; on
 * peut créer une enveloppe pour tous les mois ou pour ce mois seulement.
 */
export default function EnvelopesModal() {
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const { data: envelopes } = useLiveQuery((db) => listEnvelopesForMonth(db, month, currentWeekKey()), [month]);
  const active = (envelopes ?? []).filter((e) => isEnvelopeActive(e, month));
  const weekly = active.filter((e) => e.period === 'week');
  const monthly = active.filter((e) => e.period === 'month');
  const weeks = weeksOfMonth(month).length;
  const weeklyTotal = weekly.reduce((s, e) => s + e.weekly_cents, 0);
  const monthlyTotal = monthly.reduce((s, e) => s + e.weekly_cents, 0);
  const monthName = monthKeyLabel(month);

  return (
    <Screen>
      <ModalHeader title="Mes enveloppes" />
      <MonthSwitcher month={month} onChange={setMonth} subtitle={`${weeks} semaines`} />
      <Caption>
        Les enveloppes et montants de {monthName}. Touche une enveloppe pour changer son montant (pour tous les mois ou
        ce mois seulement) ; crée une enveloppe ponctuelle pour un besoin d’un seul mois (Anniversaire, Noël…).
      </Caption>

      <SectionHeader title={`Variables · ${formatCents(weeklyTotal)} par semaine`} />
      <Caption>
        Un montant par semaine, du lundi au dimanche : {formatCents(weeklyTotal * weeks)} sur les {weeks} semaines de{' '}
        {monthName.split(' ')[0]}.
      </Caption>
      <EnvelopeRows envelopes={weekly} unit="semaine" month={month} />
      <Button
        label="+ Nouvelle enveloppe variable"
        variant="secondary"
        onPress={() => router.push({ pathname: '/enveloppe', params: { period: 'week', month } })}
      />

      <SectionHeader title={`Postes du mois · ${formatCents(monthlyTotal)}`} />
      <Caption>Essence, Garderie, Cantine… : un montant par mois, affiché avec tes Fixes.</Caption>
      <EnvelopeRows envelopes={monthly} unit="mois" month={month} />
      <Button
        label="+ Nouveau poste du mois"
        variant="secondary"
        onPress={() => router.push({ pathname: '/enveloppe', params: { period: 'month', month } })}
      />
    </Screen>
  );
}

function EnvelopeRows({ envelopes, unit, month }: { envelopes: EnvelopeForMonth[]; unit: string; month: MonthKey }) {
  const theme = useTheme();
  if (envelopes.length === 0) {
    return (
      <Card>
        <Caption style={{ textAlign: 'center' }}>Aucune ce mois-ci.</Caption>
      </Card>
    );
  }
  return (
    <Card style={{ paddingVertical: spacing.xs }}>
      {envelopes.map((envelope, i) => {
        const tag = isOneOff(envelope)
          ? 'ponctuelle · ce mois seulement'
          : envelope.has_override
            ? `montant propre à ce mois (habituel : ${formatCents(envelope.default_cents)})`
            : `par ${unit} · tous les mois`;
        return (
          <Pressable
            key={envelope.id}
            onPress={() => router.push({ pathname: '/enveloppe', params: { id: String(envelope.id), month } })}
            accessibilityRole="button"
            accessibilityLabel={`${envelope.name} : ${formatCents(envelope.weekly_cents)} par ${unit}, ${tag}. Modifier`}
            style={({ pressed }) => [
              styles.row,
              i < envelopes.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline },
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <CategoryIcon icon={envelope.icon} color={envelope.color} size={36} />
            <View style={{ flex: 1 }}>
              <Body weight="semibold">{envelope.name}</Body>
              {envelope.weekly_cents === 0 ? <Caption tone="danger">Montant à fixer</Caption> : <Caption>{tag}</Caption>}
            </View>
            <Money cents={envelope.weekly_cents} size={16} weight="bold" />
            <Ionicons name="create-outline" size={19} color={theme.colors.textMuted} />
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
});
