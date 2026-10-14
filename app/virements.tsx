import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { CheckRow } from '@/src/components/ui/CheckRow';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Caption } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { deleteMove, listAllMoves, type MoveWithPot } from '@/src/features/savings/repository';
import { spacing } from '@/src/theme';
import { numericDate } from '@/src/utils/dates';
import { confirmAction } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

/** « Mes virements » : tous les dépôts et retraits, toutes cagnottes confondues. */
export default function TransfersModal() {
  const db = useSQLiteContext();
  const { data: moves } = useLiveQuery((db) => listAllMoves(db));
  const list = moves ?? [];

  const confirmDelete = (move: MoveWithPot) =>
    confirmAction({
      title: 'Supprimer le virement',
      message: `Supprimer ce ${move.amount_cents < 0 ? 'retrait' : 'dépôt'} de ${formatCents(Math.abs(move.amount_cents))} (${move.pot_name}) ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => void deleteMove(db, move),
    });

  return (
    <Screen>
      <ModalHeader title="Mes virements" />
      {list.length === 0 ? (
        <Card>
          <EmptyState icon="repeat" title="Aucun virement" subtitle="Tes dépôts et retraits sur tes cagnottes apparaîtront ici." />
        </Card>
      ) : (
        <>
          <Card style={{ paddingVertical: spacing.xs }}>
            {list.map((move, i) => (
              <CheckRow
                key={move.id}
                icon={move.pot_icon}
                iconColor={move.pot_color}
                title={move.pot_name}
                subtitle={`${numericDate(move.date)}${move.note ? ` · ${move.note}` : ''}`}
                cents={Math.abs(move.amount_cents)}
                sign={move.amount_cents < 0 ? -1 : 1}
                onLongPress={() => confirmDelete(move)}
                last={i === list.length - 1}
              />
            ))}
          </Card>
          <Caption style={{ textAlign: 'center' }}>Appui long sur un virement pour le supprimer</Caption>
        </>
      )}
    </Screen>
  );
}
