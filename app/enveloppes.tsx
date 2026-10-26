import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
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
  isMonthReady,
  listEnvelopesForMonth,
  listTemplates,
  resetMonthFromBase,
  resolveEnvelopeId,
  type EnvelopeForMonth,
  type EnvelopeTemplate,
} from '@/src/features/envelopes/repository';
import { useSelectedMonth } from '@/src/store/month';
import { spacing, useTheme } from '@/src/theme';
import { currentMonthKey, currentWeekKey, monthKeyLabel, weeksOfMonth, type MonthKey } from '@/src/utils/dates';
import { confirmAction } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

/**
 * « Mes enveloppes » : les enveloppes du mois sélectionné (propres à ce mois)
 * et « Ma base », le modèle copié dans chaque nouveau mois.
 */
export default function EnvelopesModal() {
  const db = useSQLiteContext();
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const { data } = useLiveQuery(
    async (db) => ({
      envelopes: await listEnvelopesForMonth(db, month, currentWeekKey()),
      ready: await isMonthReady(db, month),
      base: await listTemplates(db),
    }),
    [month],
  );
  const envelopes = data?.envelopes ?? [];
  const weekly = envelopes.filter((e) => e.period === 'week');
  const monthly = envelopes.filter((e) => e.period === 'month');
  const weeks = weeksOfMonth(month).length;
  const weeklyTotal = weekly.reduce((s, e) => s + e.weekly_cents, 0);
  const monthlyTotal = monthly.reduce((s, e) => s + e.weekly_cents, 0);
  const monthName = monthKeyLabel(month);
  const short = monthName.split(' ')[0];

  const resetFromBase = () =>
    confirmAction({
      title: 'Repartir de ma base',
      message: `Les enveloppes de ${monthName} sans dépense sont remplacées par celles de ta base. Celles qui ont des dépenses sont gardées.`,
      confirmLabel: 'Repartir de ma base',
      onConfirm: () => void resetMonthFromBase(db, month),
    });

  return (
    <Screen>
      <ModalHeader title="Mes enveloppes" />
      <MonthSwitcher month={month} onChange={setMonth} subtitle={`${weeks} semaines`} />
      <Caption>
        {data && !data.ready
          ? `${short.charAt(0).toUpperCase() + short.slice(1)} n’a pas encore commencé : il reprend ta base ci-dessous. Dès que tu y modifies une enveloppe ou notes une dépense, il a ses propres enveloppes.`
          : `Les enveloppes de ${monthName}, propres à ce mois : les modifier ne change aucun autre mois.`}
      </Caption>

      <SectionHeader title={`Variables · ${formatCents(weeklyTotal)} par semaine`} />
      <Caption>
        {formatCents(weeklyTotal * weeks)} sur les {weeks} semaines de {short}.
      </Caption>
      <EnvelopeRows envelopes={weekly} unit="semaine" month={month} />
      <Button
        label={`+ Enveloppe variable en ${short}`}
        variant="secondary"
        onPress={() => router.push({ pathname: '/enveloppe', params: { period: 'week', month } })}
      />

      <SectionHeader title={`Montants fixes du mois · ${formatCents(monthlyTotal)}`} />
      <Caption>Coiffure, essence, cantine… : un montant prévu par mois, suivi dans tes Variables (ce n’est pas une facture).</Caption>
      <EnvelopeRows envelopes={monthly} unit="mois" month={month} />
      <Button
        label={`+ Montant fixe en ${short}`}
        variant="secondary"
        onPress={() => router.push({ pathname: '/enveloppe', params: { period: 'month', month } })}
      />
      {data?.ready ? <Button label={`Repartir de ma base pour ${short}`} variant="secondary" onPress={resetFromBase} /> : null}
      {data?.ready && month <= currentMonthKey() ? (
        <Button
          label={`Clôturer ${short}`}
          variant="secondary"
          onPress={() => router.push({ pathname: '/cloture', params: { month } })}
        />
      ) : null}

      <SectionHeader title="Ma base" />
      <Caption>
        Le modèle copié dans chaque nouveau mois (Courses, Essence, Plaisir…). La modifier ne change pas les mois déjà
        commencés.
      </Caption>
      <BaseRows base={data?.base ?? []} />
      <Button
        label="+ Ajouter à ma base"
        variant="secondary"
        onPress={() => router.push({ pathname: '/enveloppe', params: { base: '1', period: 'week' } })}
      />
    </Screen>
  );
}

function EnvelopeRows({ envelopes, unit, month }: { envelopes: EnvelopeForMonth[]; unit: string; month: MonthKey }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  if (envelopes.length === 0) {
    return (
      <Card>
        <Caption style={{ textAlign: 'center' }}>Aucune ce mois-ci.</Caption>
      </Card>
    );
  }
  const open = async (envelope: EnvelopeForMonth) => {
    const id = await resolveEnvelopeId(db, envelope);
    if (id) router.push({ pathname: '/enveloppe', params: { id: String(id), month } });
  };
  return (
    <Card style={{ paddingVertical: spacing.xs }}>
      {envelopes.map((envelope, i) => (
        <Row
          key={envelope.id}
          icon={envelope.icon}
          color={envelope.color}
          name={envelope.name}
          cents={envelope.weekly_cents}
          caption={envelope.weekly_cents === 0 ? null : `par ${unit}`}
          last={i === envelopes.length - 1}
          hairline={theme.colors.hairline}
          onPress={() => void open(envelope)}
        />
      ))}
    </Card>
  );
}

function BaseRows({ base }: { base: EnvelopeTemplate[] }) {
  const theme = useTheme();
  if (base.length === 0) {
    return (
      <Card>
        <Caption style={{ textAlign: 'center' }}>Ta base est vide : les nouveaux mois commenceront sans enveloppe.</Caption>
      </Card>
    );
  }
  return (
    <Card style={{ paddingVertical: spacing.xs }}>
      {base.map((t, i) => (
        <Row
          key={t.id}
          icon={t.icon}
          color={t.color}
          name={t.name}
          cents={t.amount_cents}
          caption={t.amount_cents === 0 ? null : `par ${t.period === 'week' ? 'semaine' : 'mois'}`}
          last={i === base.length - 1}
          hairline={theme.colors.hairline}
          onPress={() => router.push({ pathname: '/enveloppe', params: { id: String(t.id), base: '1' } })}
        />
      ))}
    </Card>
  );
}

function Row({
  icon,
  color,
  name,
  cents,
  caption,
  last,
  hairline,
  onPress,
}: {
  icon: string;
  color: string;
  name: string;
  cents: number;
  caption: string | null;
  last: boolean;
  hairline: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name} : ${formatCents(cents)}${caption ? ` ${caption}` : ''}. Modifier`}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: hairline },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <CategoryIcon icon={icon} color={color} size={36} />
      <View style={{ flex: 1 }}>
        <Body weight="semibold">{name}</Body>
        {caption ? <Caption>{caption}</Caption> : <Caption tone="danger">Montant à fixer</Caption>}
      </View>
      <Money cents={cents} size={16} weight="bold" />
      <Ionicons name="create-outline" size={19} color={theme.colors.textMuted} />
    </Pressable>
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
