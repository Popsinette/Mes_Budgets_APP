import type { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { AppearancePicker } from '@/src/components/ui/AppearancePicker';
import { Button } from '@/src/components/ui/Button';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Caption } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteEnvelope,
  getEnvelope,
  listEnvelopes,
  saveEnvelope,
  type Envelope,
} from '@/src/features/envelopes/repository';
import { categoryPalette } from '@/src/theme';
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
];

export default function EnvelopeModal() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : null;
  const { data: envelope } = useLiveQuery(async (db) => (id ? getEnvelope(db, id) : null), [id]);
  const { data: all } = useLiveQuery((db) => listEnvelopes(db));
  if (!all || (id && !envelope)) return <Screen />;
  return <EnvelopeForm envelope={envelope ?? null} count={all.length} />;
}

function EnvelopeForm({ envelope, count }: { envelope: Envelope | null; count: number }) {
  const db = useSQLiteContext();
  const [name, setName] = useState(envelope?.name ?? '');
  const [amount, setAmount] = useState(centsToInput(envelope?.weekly_cents));
  const [icon, setIcon] = useState(envelope?.icon ?? 'bag-handle-outline');
  // Couleur par défaut : la teinte suivante de la palette (ordre fixe).
  const [color, setColor] = useState<string>(envelope?.color ?? categoryPalette[count % categoryPalette.length]);
  const [saving, setSaving] = useState(false);

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
    await saveEnvelope(db, { id: envelope?.id, name: name.trim(), icon, color, weeklyCents: weekly });
    router.back();
  };

  const remove = () => {
    if (!envelope) return;
    confirmAction({
      title: 'Supprimer l’enveloppe',
      message: `Supprimer « ${envelope.name} » et toutes les dépenses qu’elle contient ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await deleteEnvelope(db, envelope.id);
          router.back();
        })();
      },
    });
  };

  return (
    <Screen>
      <ModalHeader title={envelope ? 'Modifier l’enveloppe' : 'Nouvelle enveloppe'} />
      <FormField label="Nom" value={name} onChangeText={setName} placeholder="Courses, Autres, Sorties…" />
      <AmountField label="Montant par semaine" value={amount} onChangeText={setAmount} placeholder="80" />
      <Caption>
        {weekly
          ? `Environ ${formatCents(Math.round((weekly * 52) / 12))} par mois. Ajuste-le en fin de mois : trop juste, augmente un peu ; de la marge, baisse-le pour épargner plus.`
          : 'Le montant que tu t’autorises chaque semaine, du lundi au dimanche.'}
      </Caption>
      <AppearancePicker icons={ICONS} icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
      <Button label={envelope ? 'Enregistrer' : 'Créer l’enveloppe'} onPress={() => void save()} loading={saving} />
      {envelope ? <Button label="Supprimer l’enveloppe" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}
