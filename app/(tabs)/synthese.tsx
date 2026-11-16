import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { OutlookCard } from '@/src/components/OutlookCard';
import { PlanCard } from '@/src/components/PlanCard';
import { AppHeader } from '@/src/components/ui/AppHeader';
import { FadeIn } from '@/src/components/ui/FadeIn';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Body, Caption } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getMonthSummary } from '@/src/features/summary/repository';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, monthKeyLabel, shiftMonthKey } from '@/src/utils/dates';

/**
 * « Mon plan » : ce qui est PRÉVU — le plan du mois, puis les mois à venir.
 * Ce qui s'est réellement passé (bilan, répartition, tendances) vit dans
 * l'onglet Analyse : un seul endroit pour chaque question.
 */
export default function PlanScreen() {
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const { data: summary } = useLiveQuery((db) => getMonthSummary(db, month), [month]);
  const current = currentMonthKey();
  // Mois passé : on le clôture ; mois en cours ou à venir : on prépare le suivant.
  const handoverMonth = month < current ? month : current;
  const nextName = monthKeyLabel(shiftMonthKey(handoverMonth, 1)).split(' ')[0];

  return (
    <Screen bottomInset={90}>
      <AppHeader title="Mon plan" />
      <MonthSwitcher month={month} onChange={setMonth} />
      <FadeIn key={month}>
        {summary ? <PlanCard summary={summary} month={month} /> : <Skeleton height={280} radius={radius.lg} />}
        <View style={styles.actions}>
          <Action icon="options-outline" label="Enveloppes" hint="Ajuster" onPress={() => router.push('/enveloppes')} />
          <Action
            icon="sparkles-outline"
            label="Mois suivant"
            hint={`Préparer ${nextName}`}
            onPress={() => router.push({ pathname: '/cloture', params: { month: handoverMonth } })}
          />
          <Action icon="calendar-outline" label="Mon année" hint="Échéances" onPress={() => router.push('/annee')} />
        </View>
        <OutlookCard />
      </FadeIn>
    </Screen>
  );
}

function Action({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} : ${hint}`}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.dark ? theme.colors.border : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: theme.colors.primarySoft }]}>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
      </View>
      <Body weight="semibold" size={13.5} numberOfLines={1} adjustsFontSizeToFit style={{ textAlign: 'center' }}>
        {label}
      </Body>
      <Caption numberOfLines={1} style={{ fontSize: 11.5, textAlign: 'center' }}>
        {hint}
      </Caption>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
});
