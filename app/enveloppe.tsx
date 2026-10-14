import type { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { AppearancePicker } from '@/src/components/ui/AppearancePicker';
import { Button } from '@/src/components/ui/Button';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Chip } from '@/src/components/ui/Chip';
import { Caption, Eyebrow } from '@/src/components/ui/Text';
import { View } from 'react-native';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteEnvelope,
  isOneOff,
  listEnvelopes,
  listEnvelopesForMonth,
  saveEnvelope,
  stopEnvelope,
  type EnvelopeForMonth,
  type EnvelopePeriod,
} from '@/src/features/envelopes/repository';
import { useSelectedMonth } from '@/src/store/month';
import { categoryPalette, spacing } from '@/src/theme';
import { currentWeekKey, monthKeyLabel, type MonthKey } from '@/src/utils/dates';
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
];

export default function EnvelopeModal() {
  const params = useLocalSearchParams<{ id?: string; period?: string; month?: string }>();
  const globalMonth = useSelectedMonth((s) => s.month);
  const month = params.month ?? globalMonth;
  const id = params.id ? Number(params.id) : null;
  const { data: forMonth } = useLiveQuery((db) => listEnvelopesForMonth(db, month, currentWeekKey()), [month]);
  const { data: all } = useLiveQuery((db) => listEnvelopes(db));
  const envelope = id ? (forMonth ?? []).find((e) => e.id === id) : null;
  if (!all || !forMonth || (id && !envelope)) return <Screen />;
  return (
    <EnvelopeForm
      envelope={envelope ?? null}
      count={all.length}
      month={month}
      period={params.period === 'month' ? 'month' : 'week'}
    />
  );
}

function EnvelopeForm({
  envelope,
  count,
  month,
  period: initialPeriod,
}: {
  envelope: EnvelopeForMonth | null;
  count: number;
  month: MonthKey;
  period: EnvelopePeriod;
}) {
  const monthName = monthKeyLabel(month);
  const oneOff = envelope ? isOneOff(envelope) : false;
  // Création : tous les mois (à partir de celui-ci) ou ce mois seulement.
  // Modification d'une récurrente : montant pour tous les mois ou pour ce mois seulement.
  const [scope, setScope] = useState<'all' | 'only'>(envelope?.has_override ? 'only' : 'all');
  const db = useSQLiteContext();
  const [name, setName] = useState(envelope?.name ?? '');
  const [amount, setAmount] = useState(centsToInput(envelope?.weekly_cents));
  const [icon, setIcon] = useState(envelope?.icon ?? 'bag-handle-outline');
  // Couleur par défaut : la teinte suivante de la palette (ordre fixe).
  const [color, setColor] = useState<string>(envelope?.color ?? categoryPalette[count % categoryPalette.length]);
  const [period, setPeriod] = useState<EnvelopePeriod>(envelope?.period ?? initialPeriod);
  const [saving, setSaving] = useState(false);
  const isWeek = period === 'week';

  const weekly = amount.trim() ? parseAmountToCents(amount) : 0;

  const save = async () => {
    if (!name.trim()) {
      notify('Nom manquant', 'Donne un nom à cette enveloppe (ex : Courses).');
      return;
    }
    if (weekly === null) {
      notify('Montant invalide', 'Saisis un montant par semaine, par exemple 80.');
      return;
    }
    setSaving(true);
    await saveEnvelope(db, {
      id: envelope?.id,
      name: name.trim(),
      icon,
      color,
      amountCents: weekly,
      period,
      month,
      scope,
    });
    router.back();
  };

  const remove = () => {
    if (!envelope) return;
    if (oneOff) {
      confirmAction({
        title: 'Supprimer l’enveloppe',
        message: `Supprimer « ${envelope.name} » et les dépenses qu’elle contient ?`,
        confirmLabel: 'Supprimer',
        destructive: true,
        onConfirm: () => {
          void (async () => {
            await deleteEnvelope(db, envelope.id);
            router.dismissAll();
          })();
        },
      });
      return;
    }
    confirmAction({
      title: 'Arrêter l’enveloppe',
      message: `« ${envelope.name} » ne sera plus prévue à partir de ${monthName}. Les mois précédents gardent leur budget et leurs dépenses (sans historique, elle est supprimée avec ses dépenses).`,
      confirmLabel: 'Arrêter',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await stopEnvelope(db, envelope, month);
          router.dismissAll();
        })();
      },
    });
  };

  return (
    <Screen>
      <ModalHeader
        title={envelope ? `Modifier ${isWeek ? 'l’enveloppe' : 'le poste'}` : isWeek ? 'Nouvelle enveloppe' : 'Nouveau poste'}
      />
      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Type</Eyebrow>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Chip label="Variable · par semaine" selected={isWeek} onPress={() => setPeriod('week')} />
          <Chip label="Poste fixe · par mois" selected={!isWeek} onPress={() => setPeriod('month')} />
        </View>
        <Caption>
          {isWeek
            ? 'Budget variable (Courses, Autres) : un montant par semaine, du lundi au dimanche.'
            : 'Poste suivi avec tes Fixes (Essence, Garderie, Cantine…) : un montant par mois.'}
        </Caption>
      </View>
      {!envelope || !oneOff ? (
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>{envelope ? 'Ce montant vaut pour' : 'Quand ?'}</Eyebrow>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Chip
              label={envelope ? 'Tous les mois' : `Tous les mois dès ${monthName.split(' ')[0]}`}
              selected={scope === 'all'}
              onPress={() => setScope('all')}
            />
            <Chip label={`${monthName.split(' ')[0]} seulement`} selected={scope === 'only'} onPress={() => setScope('only')} />
          </View>
          <Caption>
            {envelope
              ? scope === 'all'
                ? `Montant habituel, pour tous les mois${envelope.has_override ? ` (${monthName} reprend ce montant)` : ''}.`
                : `Montant propre à ${monthName} : les autres mois gardent ${formatCents(envelope.default_cents)}.`
              : scope === 'all'
                ? `Enveloppe prévue chaque mois à partir de ${monthName}.`
                : `Enveloppe ponctuelle, seulement en ${monthName} (ex. : Anniversaire, Rentrée, Noël).`}
          </Caption>
        </View>
      ) : (
        <Caption>Enveloppe ponctuelle : seulement en {monthKeyLabel(envelope.start_month ?? month)}.</Caption>
      )}
      <FormField
        label="Nom"
        value={name}
        onChangeText={setName}
        placeholder={isWeek ? 'Courses, Autres…' : 'Essence, Garderie, Cantine…'}
      />
      <AmountField
        label={isWeek ? 'Montant par semaine' : 'Montant par mois'}
        value={amount}
        onChangeText={setAmount}
        placeholder={isWeek ? '80' : '300'}
      />
      {isWeek ? (
        <Caption>
          {weekly
            ? `Environ ${formatCents(Math.round((weekly * 52) / 12))} par mois. Ajuste-le en fin de mois : trop juste, augmente un peu ; de la marge, baisse-le pour épargner plus.`
            : 'Le montant que tu t’autorises chaque semaine.'}
        </Caption>
      ) : null}
      <AppearancePicker icons={ICONS} icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
      <Button label={envelope ? 'Enregistrer' : 'Créer'} onPress={() => void save()} loading={saving} />
      {envelope ? (
        <Button label={oneOff ? 'Supprimer' : `Arrêter à partir de ${monthName}`} variant="danger" onPress={remove} />
      ) : null}
    </Screen>
  );
}
