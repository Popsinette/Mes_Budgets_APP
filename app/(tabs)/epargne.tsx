import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money, Title } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  getMonthSaved,
  listPots,
  POT_KIND_LABELS,
  setPlanDone,
  type PotKind,
  type PotWithBalance,
} from '@/src/features/savings/repository';
import { useSelectedMonth } from '@/src/store/month';
import { spacing, useTheme } from '@/src/theme';
import { currentMonthKey, isoDayInMonth, monthKeyLabel, todayIso } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

const KIND_HINTS: Record<PotKind, string> = {
  securite: 'Ton matelas de sécurité : on n’y touche pas.',
  projet: 'Vacances, réparations, cadeaux… l’épargne qui sert.',
};

export default function SavingsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);

  const { data: pots } = useLiveQuery((db) => listPots(db, month), [month]);
  const { data: saved } = useLiveQuery((db) => getMonthSaved(db, month), [month]);

  const total = (pots ?? []).reduce((s, p) => s + p.balance_cents, 0);
  const monthName = monthKeyLabel(month).split(' ')[0];

  const togglePlan = (pot: PotWithBalance) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const date = month === currentMonthKey() ? todayIso() : isoDayInMonth(month, 1);
    void setPlanDone(db, pot, month, pot.plan_done !== 1, date);
  };

  const renderPot = (pot: PotWithBalance) => {
    const ratio = pot.target_cents ? pot.balance_cents / pot.target_cents : 0;
    const done = pot.plan_done === 1;
    return (
      <Card
        key={pot.id}
        style={{ gap: spacing.md }}
        onPress={() => router.push({ pathname: '/poche-detail', params: { id: String(pot.id) } })}
      >
        <View style={styles.row}>
          <CategoryIcon icon={pot.icon} color={pot.color} size={42} />
          <View style={{ flex: 1, gap: 1 }}>
            <Body weight="semibold" size={15.5}>
              {pot.name}
            </Body>
            {pot.target_cents ? (
              <Caption>
                {Math.round(ratio * 100)} % de {formatCents(pot.target_cents)}
              </Caption>
            ) : (
              <Caption>Pas d’objectif</Caption>
            )}
          </View>
          <Money cents={pot.balance_cents} size={19} weight="bold" />
        </View>
        {pot.target_cents ? (
          <ProgressBar ratio={ratio} color={ratio >= 1 ? theme.colors.success : pot.color} />
        ) : null}
        {pot.monthly_cents ? (
          <Pressable
            onPress={() => togglePlan(pot)}
            style={styles.planRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={`Versement de ${monthName}`}
          >
            <Ionicons
              name={done ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={done ? theme.colors.success : theme.colors.textMuted}
            />
            <Caption style={{ flex: 1 }}>
              Versement de {monthName} {done ? 'fait' : 'à faire'}
            </Caption>
            <Money cents={pot.monthly_cents} size={14} tone={done ? 'success' : 'muted'} />
          </Pressable>
        ) : null}
      </Card>
    );
  };

  const kinds: PotKind[] = ['securite', 'projet'];

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={80}>
        <Title>Mon épargne</Title>

        <View>
          <Eyebrow tone="success">Épargne totale</Eyebrow>
          <Money cents={total} size={44} weight="xbold" tone="success" style={{ marginTop: 2 }} />
          <Caption style={{ marginTop: 4 }}>
            {saved && saved !== 0
              ? `${formatCents(saved, { signed: true })} en ${monthName}`
              : `Rien mis de côté en ${monthName} pour l’instant`}
          </Caption>
        </View>

        <MonthSwitcher month={month} onChange={setMonth} />

        {(pots ?? []).length === 0 ? (
          <Card>
            <EmptyState
              icon="leaf-outline"
              title="Aucune poche d’épargne"
              subtitle="Crée une poche « Urgence & avenir » pour ta sécurité, puis des poches pour tes projets."
            />
          </Card>
        ) : null}

        {kinds.map((kind) => {
          const list = (pots ?? []).filter((p) => p.kind === kind);
          if (list.length === 0) return null;
          return (
            <View key={kind} style={{ gap: spacing.md }}>
              <View>
                <SectionHeader title={POT_KIND_LABELS[kind]} />
                <Caption>{KIND_HINTS[kind]}</Caption>
              </View>
              {list.map(renderPot)}
            </View>
          );
        })}

        <Pressable
          onPress={() => router.push('/poche')}
          style={[styles.newPot, { borderColor: theme.colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Nouvelle poche"
        >
          <Ionicons name="add" size={18} color={theme.colors.text} />
          <Body weight="semibold" size={14}>
            Nouvelle poche
          </Body>
        </Pressable>
      </Screen>
      <FAB onPress={() => router.push('/mouvement')} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  newPot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
