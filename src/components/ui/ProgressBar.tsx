import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '@/src/theme';
import { clampRatio } from '@/src/utils/money';

type ProgressBarProps = {
  /** Progression entre 0 et 1 (les dépassements sont bornés visuellement). */
  ratio: number;
  color?: string;
  height?: number;
  /**
   * Repère de rythme (0..1) : où l'on « devrait » en être. Pour un budget du
   * mois courant, c'est la fraction du mois écoulée. Affiché comme un fin trait.
   */
  markerRatio?: number;
};

/**
 * Compteur horizontal. Piste arrondie, remplissage net qui glisse vers sa
 * valeur (250 ms, ease-out) au montage et à chaque changement. En cas de
 * dépassement, le remplissage passe en rouge. Un repère de rythme optionnel
 * montre où l'on « devrait » en être dans le mois.
 */
export function ProgressBar({ ratio, color, height = 9, markerRatio }: ProgressBarProps) {
  const theme = useTheme();
  const clamped = clampRatio(ratio);
  const over = ratio > 1;
  const barColor =
    color ?? (over ? theme.colors.danger : ratio > 0.9 ? theme.colors.warning : theme.colors.primary);
  const markerColor = theme.dark ? 'rgba(255,255,255,0.5)' : 'rgba(20,20,26,0.34)';
  // Un minimum visible dès qu'il y a la moindre dépense.
  const targetPct = clamped > 0 ? Math.max(clamped * 100, height / 2) : 0;

  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: targetPct,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // la largeur en % n'est pas animable nativement
    }).start();
  }, [progress, targetPct]);

  const animatedWidth = progress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { backgroundColor: theme.colors.cardMuted, height, borderRadius: height / 2 }]}
    >
      <Animated.View
        style={[styles.fill, { backgroundColor: barColor, width: animatedWidth, borderRadius: height / 2 }]}
      />
      {markerRatio != null && markerRatio > 0 && markerRatio < 1 ? (
        <View
          style={[
            styles.marker,
            { left: `${clampRatio(markerRatio) * 100}%`, backgroundColor: markerColor },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    height: '100%',
  },
  marker: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
    borderRadius: 1,
    marginLeft: -1,
  },
});
