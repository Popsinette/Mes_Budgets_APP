import type { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';
import { AppearancePicker } from '@/src/components/ui/AppearancePicker';
import { Button } from '@/src/components/ui/Button';
import { Chip } from '@/src/components/ui/Chip';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Caption, Eyebrow } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteEnvelope,
  deleteTemplate,
  getEnvelope,
  getTemplate,
  listTemplates,
  saveEnvelope,
  saveTemplate,
  type EnvelopePeriod,
} from '@/src/features/envelopes/repository';
import { useSelectedMonth } from '@/src/store/month';
import { categoryPalette, spacing } from '@/src/theme';
import { monthKeyLabel, type MonthKey } from '@/src/utils/dates';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { centsToInput, formatCents, parseAmountToCents } from '@/src/utils/money';

const ICONS: Array<keyof typeof Ionicons.glyphMap> = [
  'cart-outline',
  'bag-handle-outline',
  'restaurant-outline',
  'cafe-outline',
  'car-outline',
  'game-controller-outline',
  'shirt-outline',
  'gift-outline',
  'paw-outline',
  'happy-outline',
  'medkit-outline',
  'sparkles-outline',
  'car-sport-outline',
  'school-outline',
  'football-outline',
  'water-outline',
  'cut-outline',
  'fitness-outline',
  'book-outline',
  'flower-outline',
];

type Draft = { name: string; icon: string; color: string; amount: number; period: EnvelopePeriod };

/**
 * Enveloppe d'un mois (`id`, ou création pour `month`) — ou ligne de « Ma base »
 * (`base=1`, `id` de base ou création). Une enveloppe de mois n'a aucun lien
 * avec les autres mois ; la base ne sert que de modèle aux mois à venir.
 */
export default function EnvelopeModal() {
  const params = useLocalSearchParams<{ id?: string; period?: string; month?: string; base?: string }>();
  const globalMonth = useSelectedMonth((s) => s.month);
  const month = params.month ?? globalMonth;
  const isBase = params.base === '1';
  const id = params.id ? Number(params.id) : null;
  const { data } = useLiveQuery(
    async (db) => {
      const count = (await listTemplates(db)).length;
      if (!id) return { draft: null, count, month };
      if (isBase) {
        const t = await getTemplate(db, id);
        return t
          ? { draft: { name: t.name, icon: t.icon, color: t.color, amount: t.amount_cents, period: t.period }, count, month }
          : null;
      }
      const e = await getEnvelope(db, id);
      return e
        ? { draft: { name: e.name, icon: e.icon, color: e.color, amount: e.weekly_cents, period: e.period }, count, month: e.month }
        : null;
    },
    [id, isBase, month],
  );
  if (!data) return <Screen />;
  return (
    <EnvelopeForm
      id={id}
      isBase={isBase}
      draft={data.draft}
      count={data.count}
      month={data.month}
      period={params.period === 'month' ? 'month' : 'week'}
    />
  );
}

function EnvelopeForm({
  id,
  isBase,
  draft,
  count,
  month,
  period: initialPeriod,
}: {
  id: number | null;
  isBase: boolean;
  draft: Draft | null;
  count: number;
  month: MonthKey;
  period: EnvelopePeriod;
}) {
  const db = useSQLiteContext();
  const monthName = monthKeyLabel(month);
  const [name, setName] = useState(draft?.name ?? '');
  const [amount, setAmount] = useState(centsToInput(draft?.amount));
  const [icon, setIcon] = useState(draft?.icon ?? 'bag-handle-outline');
  // Couleur par défaut : la teinte suivante de la palette (ordre fixe).
  const [color, setColor] = useState<string>(draft?.color ?? categoryPalette[count % categoryPalette.length]);
  const [period, setPeriod] = useState<EnvelopePeriod>(draft?.period ?? initialPeriod);
  const [saving, setSaving] = useState(false);
  const isWeek = period === 'week';
  const weekly = amount.trim() ? parseAmountToCents(amount) : 0;

  const save = async () => {
    if (!name.trim()) {
      notify('Nom manquant', 'Donne un nom à cette enveloppe (ex : Courses).');
      return;
    }
    if (weekly === null) {
      notify('Montant invalide', 'Saisis un montant, par exemple 80.');
      return;
    }
    setSaving(true);
    const payload = { name: name.trim(), icon, color, amountCents: weekly, period };
    if (isBase) await saveTemplate(db, { id: id ?? undefined, ...payload });
    else await saveEnvelope(db, { id: id ?? undefined, month, ...payload });
    router.back();
  };

  const remove = () => {
    if (!id) return;
    confirmAction({
      title: isBase ? 'Retirer de ma base' : 'Supprimer l’enveloppe',
      message: isBase
        ? `« ${name} » ne sera plus copiée dans les prochains mois. Les mois déjà commencés ne changent pas.`
        : `Supprimer « ${name} » de ${monthName} et ses dépenses ? Les autres mois ne changent pas.`,
      confirmLabel: isBase ? 'Retirer' : 'Supprimer',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          if (isBase) await deleteTemplate(db, id);
          else await deleteEnvelope(db, id);
          router.back();
        })();
      },
    });
  };

  const what = isWeek ? 'l’enveloppe' : 'le montant fixe';
  const title = isBase
    ? id
      ? 'Modifier ma base'
      : 'Ajouter à ma base'
    : id
      ? `Modifier ${what}`
      : isWeek
        ? 'Nouvelle enveloppe'
        : 'Nouveau montant fixe';

  return (
    <Screen>
      <ModalHeader title={title} />
      <Caption>
        {isBase
          ? 'Ma base : le modèle copié dans chaque nouveau mois. La modifier ne change pas les mois déjà commencés.'
          : `Pour ${monthName} uniquement : les autres mois ne sont pas touchés.`}
      </Caption>
      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Type</Eyebrow>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Chip label="Par semaine" selected={isWeek} onPress={() => setPeriod('week')} />
          <Chip label="Montant fixe par mois" selected={!isWeek} onPress={() => setPeriod('month')} />
        </View>
        <Caption>
          {isWeek
            ? 'Courses, Plaisir… : un montant par semaine, du lundi au dimanche.'
            : 'Coiffure, essence, cantine… : un montant prévu chaque mois. Il reste dans tes Variables — ce n’est pas une facture.'}
        </Caption>
      </View>
      <FormField
        label="Nom"
        value={name}
        onChangeText={setName}
        placeholder={isWeek ? 'Courses, Plaisir…' : 'Coiffure, Essence, Cantine…'}
      />
      <AmountField
        label={isWeek ? 'Montant par semaine' : 'Montant par mois'}
        value={amount}
        onChangeText={setAmount}
        placeholder={isWeek ? '80' : '60'}
      />
      {isWeek && weekly ? (
        <Caption>Environ {formatCents(Math.round((weekly * 52) / 12))} par mois.</Caption>
      ) : null}
      <AppearancePicker icons={ICONS} icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
      <Button label={id ? 'Enregistrer' : isBase ? 'Ajouter à ma base' : 'Créer'} onPress={() => void save()} loading={saving} />
      {id ? (
        <Button label={isBase ? 'Retirer de ma base' : `Supprimer de ${monthName}`} variant="danger" onPress={remove} />
      ) : null}
    </Screen>
  );
}
