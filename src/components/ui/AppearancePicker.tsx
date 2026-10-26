import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { categoryPalette, spacing, useTheme } from '@/src/theme';
import { Eyebrow } from './Text';

type IconName = keyof typeof Ionicons.glyphMap;

type AppearancePickerProps = {
  icons: IconName[];
  icon: string;
  color: string;
  onIcon: (icon: IconName) => void;
  onColor: (color: string) => void;
};

/** Choix d'icône et de couleur (palette validée) pour une enveloppe ou une poche. */
export function AppearancePicker({ icons, icon, color, onIcon, onColor }: AppearancePickerProps) {
  const theme = useTheme();
  const shown = theme.tint(color);
  return (
    <>
      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Icône</Eyebrow>
        <View style={styles.row}>
          {icons.map((value) => (
            <Pressable
              key={value}
              onPress={() => onIcon(value)}
              accessibilityRole="button"
              accessibilityLabel={value}
              style={[
                styles.icon,
                {
                  backgroundColor: icon === value ? `${shown}22` : theme.colors.card,
                  borderColor: icon === value ? shown : theme.colors.border,
                },
              ]}
            >
              <Ionicons name={value} size={22} color={icon === value ? shown : theme.colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Couleur</Eyebrow>
        <View style={styles.row}>
          {categoryPalette.map((value) => (
            <Pressable
              key={value}
              onPress={() => onColor(value)}
              accessibilityRole="button"
              accessibilityLabel={`Couleur ${value}`}
              style={[
                styles.color,
                { backgroundColor: theme.tint(value), borderWidth: color === value ? 3 : 0, borderColor: theme.colors.text },
              ]}
            />
          ))}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  color: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
});
