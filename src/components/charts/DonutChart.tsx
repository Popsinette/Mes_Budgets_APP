import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '@/src/theme';

export type DonutSlice = {
  value: number;
  color: string;
};

type DonutChartProps = {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSubLabel?: string;
};

/** Anneau des dépenses par catégorie (SVG pur, sans dépendance graphique lourde). */
export function DonutChart({
  slices,
  size = 168,
  strokeWidth = 18,
  centerLabel,
  centerSubLabel,
}: DonutChartProps) {
  const theme = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  let offset = 0;
  const segments = total > 0
    ? slices
        .filter((s) => s.value > 0)
        .map((slice, index) => {
          const fraction = slice.value / total;
          const length = fraction * circumference;
          const segment = (
            <Circle
              key={index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              fill="none"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return segment;
        })
    : [];

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.colors.cardMuted}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {segments}
        </G>
      </Svg>
      <View style={styles.center}>
        {centerLabel ? (
          <Text style={[styles.centerLabel, { color: theme.colors.text }]} numberOfLines={1}>
            {centerLabel}
          </Text>
        ) : null}
        {centerSubLabel ? (
          <Text style={[styles.centerSubLabel, { color: theme.colors.textMuted }]}>{centerSubLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    fontSize: 20,
    fontWeight: '800',
  },
  centerSubLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
