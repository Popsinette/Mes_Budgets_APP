import { StyleSheet, View } from 'react-native';
import { radius, useTheme } from '@/src/theme';
import { clampRatio } from '@/src/utils/money';

type ProgressBarProps = {
  /** Progression entre 0 et 1 (les dépassements sont bornés visuellement). */
  ratio: number;
  color?: string;
  height?: number;
};

export function ProgressBar({ ratio, color, height = 8 }: ProgressBarProps) {
  const theme = useTheme();
  const clamped = clampRatio(ratio);
  const barColor =
    color ?? (ratio > 1 ? theme.colors.danger : ratio > 0.85 ? theme.colors.warning : theme.colors.primary);

  return (
    <View style={[styles.track, { backgroundColor: theme.colors.cardMuted, height, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.fill,
          { backgroundColor: barColor, width: `${clamped * 100}%`, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.full,
  },
  fill: {
    height: '100%',
  },
});
