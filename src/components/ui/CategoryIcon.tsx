import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/src/theme';

type CategoryIconProps = {
  icon: string;
  color: string;
  size?: number;
};

/** Pastille ronde colorée avec l'icône de la catégorie. */
export function CategoryIcon({ icon, color: stored, size = 40 }: CategoryIconProps) {
  const theme = useTheme();
  const color = theme.tint(stored);
  const name = (icon in Ionicons.glyphMap ? icon : 'pricetag-outline') as keyof typeof Ionicons.glyphMap;
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}${theme.dark ? '33' : '24'}` },
      ]}
    >
      <Ionicons name={name} size={size * 0.5} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
