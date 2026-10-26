import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption } from '@/src/components/ui/Text';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';

type Choice = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  color: 'primary' | 'secondary' | 'navy' | 'rose' | 'gold';
  href: (month: string) => Href;
};

const CHOICES: Choice[] = [
  {
    icon: 'basket-outline',
    title: 'Dépense',
    subtitle: 'Courses, autres achats, essence…',
    color: 'primary',
    href: (month) => ({ pathname: '/depense', params: { month } }),
  },
  {
    icon: 'receipt-outline',
    title: 'Charge fixe',
    subtitle: 'Loyer, factures, abonnements',
    color: 'navy',
    href: (month) => ({ pathname: '/fixe', params: { month, kind: 'charge' } }),
  },
  {
    icon: 'wallet-outline',
    title: 'Revenu',
    subtitle: 'Salaire, CAF, prime…',
    color: 'secondary',
    href: (month) => ({ pathname: '/fixe', params: { month, kind: 'income' } }),
  },
  {
    icon: 'medkit-outline',
    title: 'Frais de santé',
    subtitle: 'Avance et remboursement attendu',
    color: 'rose',
    href: () => '/sante',
  },
  {
    icon: 'bag-handle-outline',
    title: 'Virement d’épargne',
    subtitle: 'Dépôt ou retrait sur une cagnotte',
    color: 'gold',
    href: () => '/mouvement',
  },
];

/** Feuille du bouton + : que veux-tu ajouter ? */
export default function AddSheet() {
  const theme = useTheme();
  const month = useSelectedMonth((s) => s.month);
  return (
    <Screen>
      <ModalHeader title="Ajouter" />
      <View style={{ gap: spacing.sm }}>
        {CHOICES.map((choice) => (
          <Pressable
            key={choice.title}
            onPress={() => router.replace(choice.href(month))}
            accessibilityRole="button"
            accessibilityLabel={choice.title}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.colors.card, borderColor: theme.dark ? theme.colors.border : 'transparent', opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: `${theme.colors[choice.color]}${theme.dark ? '33' : '22'}` }]}>
              <Ionicons name={choice.icon} size={22} color={theme.colors[choice.color]} />
            </View>
            <View style={{ flex: 1 }}>
              <Body weight="semibold">{choice.title}</Body>
              <Caption>{choice.subtitle}</Caption>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
