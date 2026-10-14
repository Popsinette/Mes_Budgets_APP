import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '@/src/theme';
import { Body } from './Text';

type Segment<K extends string> = { key: K; label: string; icon?: keyof typeof Ionicons.glyphMap };

/** Onglets segmentés (Variables · Fixes · Revenus · Santé) : pastille terracotta pour l'actif. */
export function Segmented<K extends string>({
  segments,
  value,
  onChange,
}: {
  segments: Segment<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      {segments.map((segment) => {
        const active = segment.key === value;
        const color = active ? theme.colors.onPrimary : theme.colors.text;
        return (
          <Pressable
            key={segment.key}
            onPress={() => onChange(segment.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={segment.label}
            style={[styles.segment, active && { backgroundColor: theme.colors.primary }]}
          >
            {segment.icon ? <Ionicons name={segment.icon} size={18} color={color} /> : null}
            <Body size={12.5} weight={active ? 'semibold' : 'medium'} color={color} numberOfLines={1}>
              {segment.label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
});
