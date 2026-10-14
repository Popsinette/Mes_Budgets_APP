import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { listEnvelopes, type Envelope } from '@/src/features/envelopes/repository';
import { spacing, useTheme } from '@/src/theme';
import { formatCents } from '@/src/utils/money';

/**
 * « Mes enveloppes » : toutes les enveloppes au même endroit, avec leur
 * montant. Toucher une ligne ouvre sa modification ; boutons pour en créer.
 */
export default function EnvelopesModal() {
  const { data: envelopes } = useLiveQuery((db) => listEnvelopes(db));
  const weekly = (envelopes ?? []).filter((e) => e.period === 'week');
  const monthly = (envelopes ?? []).filter((e) => e.period === 'month');
  const weeklyTotal = weekly.reduce((s, e) => s + e.weekly_cents, 0);
  const monthlyTotal = monthly.reduce((s, e) => s + e.weekly_cents, 0);

  return (
    <Screen>
      <ModalHeader title="Mes enveloppes" />
      <Caption>
        Touche une enveloppe pour changer son montant, son nom ou la supprimer. Le plan du mois (Synthèse) se met à
        jour aussitôt.
      </Caption>

      <SectionHeader title={`Variables · ${formatCents(weeklyTotal)} par semaine`} />
      <Caption>
        Courses, Autres… : un montant par semaine, du lundi au dimanche (≈ {formatCents(Math.round((weeklyTotal * 52) / 12))}{' '}
        par mois).
      </Caption>
      <EnvelopeRows envelopes={weekly} unit="semaine" />
      <Button
        label="+ Nouvelle enveloppe variable"
        variant="secondary"
        onPress={() => router.push({ pathname: '/enveloppe', params: { period: 'week' } })}
      />

      <SectionHeader title={`Postes du mois · ${formatCents(monthlyTotal)} par mois`} />
      <Caption>Essence, Garderie, Cantine… : un montant par mois, affiché avec tes Fixes.</Caption>
      <EnvelopeRows envelopes={monthly} unit="mois" />
      <Button
        label="+ Nouveau poste du mois"
        variant="secondary"
        onPress={() => router.push({ pathname: '/enveloppe', params: { period: 'month' } })}
      />
    </Screen>
  );
}

function EnvelopeRows({ envelopes, unit }: { envelopes: Envelope[]; unit: string }) {
  const theme = useTheme();
  if (envelopes.length === 0) {
    return (
      <Card>
        <Caption style={{ textAlign: 'center' }}>Aucune pour l’instant.</Caption>
      </Card>
    );
  }
  return (
    <Card style={{ paddingVertical: spacing.xs }}>
      {envelopes.map((envelope, i) => (
        <Pressable
          key={envelope.id}
          onPress={() => router.push({ pathname: '/enveloppe', params: { id: String(envelope.id) } })}
          accessibilityRole="button"
          accessibilityLabel={`${envelope.name} : ${formatCents(envelope.weekly_cents)} par ${unit}. Modifier`}
          style={({ pressed }) => [
            styles.row,
            i < envelopes.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline },
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <CategoryIcon icon={envelope.icon} color={envelope.color} size={36} />
          <View style={{ flex: 1 }}>
            <Body weight="semibold">{envelope.name}</Body>
            {envelope.weekly_cents === 0 ? (
              <Caption tone="danger">Montant à fixer</Caption>
            ) : (
              <Caption>par {unit}</Caption>
            )}
          </View>
          <Money cents={envelope.weekly_cents} size={16} weight="bold" />
          <Ionicons name="create-outline" size={19} color={theme.colors.textMuted} />
        </Pressable>
      ))}
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
