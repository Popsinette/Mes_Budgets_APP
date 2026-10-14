import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '@/src/theme';
import { Body, Caption, Money } from './Text';

type CheckRowProps = {
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  cents: number;
  /** Signe affiché : « + » revenu, « − » dépense. */
  sign: 1 | -1;
  checked?: boolean;
  onToggle?: () => void;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Remplace la coche (ex. badge « Solder » / « Terminé »). */
  trailing?: React.ReactNode;
  last?: boolean;
};

/** Ligne de liste façon Budgetiz : pastille, libellé + jour, montant signé, coche ronde. */
export function CheckRow({
  icon,
  iconColor,
  title,
  subtitle,
  cents,
  sign,
  checked,
  onToggle,
  onPress,
  onLongPress,
  trailing,
  last,
}: CheckRowProps) {
  const theme = useTheme();
  const name = (icon in Ionicons.glyphMap ? icon : 'ellipse-outline') as keyof typeof Ionicons.glyphMap;
  return (
    <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline }]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={!onPress && !onLongPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={({ pressed }) => [styles.main, { opacity: pressed ? 0.6 : 1 }]}
      >
        <View style={[styles.icon, { backgroundColor: iconColor }]}>
          <Ionicons name={name} size={17} color={theme.colors.onAccent} />
        </View>
        <View style={{ flex: 1 }}>
          <Body weight="medium" numberOfLines={1}>
            {title}
          </Body>
          <Caption>{subtitle}</Caption>
        </View>
        <Money
          cents={sign * cents}
          signed
          size={15}
          weight="semibold"
          tone={sign > 0 ? 'text' : 'expense'}
        />
      </Pressable>
      {trailing ??
        (onToggle ? (
          <Pressable
            hitSlop={10}
            onPress={onToggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: Boolean(checked) }}
            accessibilityLabel={`${title} : ${checked ? 'fait' : 'à faire'}`}
          >
            <Ionicons
              name={checked ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={checked ? theme.colors.secondary : theme.colors.textMuted}
            />
          </Pressable>
        ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
