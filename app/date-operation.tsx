import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Chip } from '@/src/components/ui/Chip';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  dateChangeLocksMonth,
  getTransaction,
  updateTransactionDate,
} from '@/src/features/transactions/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import {
  currentMonthKey,
  dayOfIsoDay,
  daysInMonth,
  isoDayInMonth,
  monthDayGrid,
  monthKeyLabel,
  monthOfIsoDay,
  shiftMonthKey,
  shortDayLabel,
  todayIso,
  type MonthKey,
} from '@/src/utils/dates';
import { notify } from '@/src/utils/dialogs';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/**
 * Corrige la date d'une opération déjà enregistrée : on a saisi la dépense le
 * jour où on l'a faite, la banque l'a débitée un autre jour — ou on s'est
 * simplement trompé. Choix du jour dans un calendrier, mois par mois.
 */
export default function TransactionDateScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : null;

  const { data: transaction, loading } = useLiveQuery(
    (db) => (id == null ? Promise.resolve(null) : getTransaction(db, id)),
    [id],
  );

  // Mois affiché et jour choisi, initialisés sur la date actuelle de l'opération.
  const [month, setMonth] = useState<MonthKey | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!transaction || month !== null) return;
    setMonth(monthOfIsoDay(transaction.date));
    setDay(dayOfIsoDay(transaction.date));
  }, [transaction, month]);

  if (!transaction || month === null || day === null) {
    return (
      <Screen>
        <ModalHeader title="Modifier la date" />
        <Body tone="muted">{loading ? 'Chargement…' : 'Opération introuvable.'}</Body>
      </Screen>
    );
  }

  const isIncome = transaction.type === 'income';
  // Une dépense de facture reste dans le mois de son pointage (lien bill_payments).
  const monthLocked = dateChangeLocksMonth(transaction);
  const selectedDate = isoDayInMonth(month, day);
  const unchanged = selectedDate === transaction.date;
  const today = todayIso();

  const goToMonth = (offset: number) => {
    const next = shiftMonthKey(month, offset);
    setMonth(next);
    setDay(Math.min(day, daysInMonth(next)));
  };

  const pickToday = () => {
    setMonth(monthOfIsoDay(today));
    setDay(dayOfIsoDay(today));
  };

  const save = async () => {
    if (id == null) return;
    setSaving(true);
    try {
      await updateTransactionDate(db, id, selectedDate);
      router.back();
    } catch (error) {
      setSaving(false);
      notify('Date impossible', error instanceof Error ? error.message : 'Réessayez.');
    }
  };

  return (
    <Screen>
      <ModalHeader title="Modifier la date" />

      <Card style={styles.recap}>
        <CategoryIcon
          icon={
            isIncome ? 'arrow-down-outline' : (transaction.category_icon ?? 'pricetag-outline')
          }
          color={
            isIncome ? theme.colors.success : (transaction.category_color ?? theme.colors.textMuted)
          }
          size={40}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Body weight="semibold" numberOfLines={1}>
            {transaction.label}
          </Body>
          <Caption numberOfLines={1}>
            Actuellement le {shortDayLabel(transaction.date)}
            {transaction.cleared === 0 ? ' · à venir' : ''}
          </Caption>
        </View>
        <Money
          cents={isIncome ? transaction.amount_cents : -transaction.amount_cents}
          size={16}
          weight="bold"
          signed
          tone={isIncome ? 'income' : 'text'}
        />
      </Card>

      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Nouvelle date</Eyebrow>
        <View style={[styles.monthRow, { borderColor: theme.colors.border }]}>
          <Pressable
            hitSlop={10}
            disabled={monthLocked}
            onPress={() => goToMonth(-1)}
            accessibilityRole="button"
            accessibilityLabel="Mois précédent"
            style={[
              styles.arrow,
              { backgroundColor: theme.colors.cardMuted, opacity: monthLocked ? 0.3 : 1 },
            ]}
          >
            <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
          </Pressable>
          <Body weight="semibold" size={16}>
            {monthKeyLabel(month).charAt(0).toUpperCase() + monthKeyLabel(month).slice(1)}
          </Body>
          <Pressable
            hitSlop={10}
            disabled={monthLocked}
            onPress={() => goToMonth(1)}
            accessibilityRole="button"
            accessibilityLabel="Mois suivant"
            style={[
              styles.arrow,
              { backgroundColor: theme.colors.cardMuted, opacity: monthLocked ? 0.3 : 1 },
            ]}
          >
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
          </Pressable>
        </View>

        <Card style={{ gap: spacing.sm }}>
          <View style={styles.grid}>
            {WEEKDAYS.map((label, i) => (
              <View key={`wd-${i}`} style={styles.cell}>
                <Caption style={styles.weekday}>{label}</Caption>
              </View>
            ))}
          </View>
          <View style={styles.grid}>
            {monthDayGrid(month).map((value, i) => {
              if (value === null) return <View key={`empty-${i}`} style={styles.cell} />;
              const iso = isoDayInMonth(month, value);
              const isSelected = value === day;
              const isToday = iso === today;
              return (
                <Pressable
                  key={value}
                  onPress={() => setDay(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={shortDayLabel(iso)}
                  style={styles.cell}
                >
                  <View
                    style={[
                      styles.day,
                      isSelected && { backgroundColor: theme.colors.primary },
                      !isSelected &&
                        isToday && { borderWidth: 1, borderColor: theme.colors.textMuted },
                    ]}
                  >
                    <Body
                      size={14.5}
                      weight={isSelected ? 'semibold' : 'regular'}
                      color={isSelected ? theme.colors.onPrimary : theme.colors.text}
                    >
                      {String(value)}
                    </Body>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {monthLocked ? (
          <Caption>
            Cette dépense vient du pointage d’une facture : elle reste dans{' '}
            {monthKeyLabel(month)}. Pour la déplacer, dé-pointez la facture puis re-pointez-la sur
            l’autre mois.
          </Caption>
        ) : (
          <Caption>
            Choisir un jour d’un autre mois déplace l’opération dans ce mois — soldes et budgets
            suivent.
          </Caption>
        )}

        {monthLocked && monthOfIsoDay(today) !== month ? null : (
          <View style={styles.quickRow}>
            <Chip label="Aujourd’hui" selected={selectedDate === today} onPress={pickToday} />
          </View>
        )}
      </View>

      <Button
        label={unchanged ? `Déjà daté du ${shortDayLabel(selectedDate)}` : `Dater du ${shortDayLabel(selectedDate)}`}
        onPress={() => void save()}
        disabled={unchanged}
        loading={saving}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  recap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  weekday: {
    fontSize: 11.5,
    letterSpacing: 0.5,
  },
  day: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
