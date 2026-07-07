import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type PropsWithChildren } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSecurity } from '@/src/store/security';
import { radius, spacing, useTheme } from '@/src/theme';

/**
 * Verrouille l'application derrière Face ID / Touch ID / empreinte quand
 * l'option est activée dans les réglages. L'app se reverrouille à chaque
 * passage en arrière-plan.
 */
export function BiometricGate({ children }: PropsWithChildren) {
  const theme = useTheme();
  const { biometricEnabled, unlocked, hydrate, lock, tryUnlock } = useSecurity();
  const attemptedRef = useRef(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        attemptedRef.current = false;
        lock();
      }
    });
    return () => subscription.remove();
  }, [lock]);

  // Propose automatiquement Face ID dès que l'écran de verrouillage apparaît.
  useEffect(() => {
    if (biometricEnabled && !unlocked && !attemptedRef.current) {
      attemptedRef.current = true;
      void tryUnlock();
    }
  }, [biometricEnabled, unlocked, tryUnlock]);

  if (biometricEnabled === null) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (biometricEnabled && !unlocked) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.lockIcon, { backgroundColor: theme.colors.primarySoft }]}>
          <Ionicons name="lock-closed" size={36} color={theme.colors.primary} />
        </View>
        <Text style={[styles.title, { color: theme.colors.text }]}>Mes Budgets est verrouillé</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          Authentifiez-vous pour accéder à vos données
        </Text>
        <Pressable
          onPress={() => {
            void tryUnlock();
          }}
          style={({ pressed }) => [
            styles.unlockButton,
            { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="finger-print" size={20} color={theme.colors.onPrimary} />
          <Text style={[styles.unlockLabel, { color: theme.colors.onPrimary }]}>Déverrouiller</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  lockIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.full,
    marginTop: spacing.xl,
  },
  unlockLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
});
