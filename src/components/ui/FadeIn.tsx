import { useEffect, useRef, type PropsWithChildren } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { spacing } from '@/src/theme';

/**
 * Apparition douce (fondu + léger glissement vers le haut, 240 ms). Donner une
 * `key` qui change (mois, onglet, étape) rejoue l'animation à chaque bascule.
 */
export function FadeIn({ children, style, delay = 0 }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; delay?: number }>) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 240,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, delay]);
  return (
    <Animated.View
      style={[
        { gap: spacing.lg },
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
