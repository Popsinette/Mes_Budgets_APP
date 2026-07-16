import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, type DimensionValue } from 'react-native';
import { radius as radiusTokens, useTheme } from '@/src/theme';

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  /** Rayon des coins (par défaut : doux, assorti aux cartes). */
  radius?: number;
  style?: object;
};

/**
 * Bloc de chargement : une surface neutre qui respire (opacité 0.5 → 1,
 * 900 ms aller-retour). Subtil — jamais de shimmer agressif.
 */
export function Skeleton({ width = '100%', height = 16, radius = radiusTokens.sm, style }: SkeletonProps) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.block,
        { width, height, borderRadius: radius, backgroundColor: theme.colors.cardMuted, opacity: pulse },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    overflow: 'hidden',
  },
});
