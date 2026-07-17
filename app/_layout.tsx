import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import {
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_600SemiBold,
  SchibstedGrotesk_700Bold,
  SchibstedGrotesk_800ExtraBold,
} from '@expo-google-fonts/schibsted-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { Suspense, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BiometricGate } from '@/src/components/BiometricGate';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { DATABASE_NAME, onDatabaseInit } from '@/src/db';
import { useThemePref } from '@/src/store/themePref';
import { spacing, useTheme } from '@/src/theme';

/**
 * Pendant le déverrouillage de la base chiffrée : un squelette de l'accueil
 * plutôt qu'un spinner — l'interface annonce sa structure avant ses données.
 */
function DatabaseLoading() {
  const theme = useTheme();
  return (
    <View style={[styles.loading, { backgroundColor: theme.colors.background }]}>
      <View style={styles.loadingColumn}>
        <Skeleton width={96} height={12} />
        <Skeleton width={190} height={40} radius={10} style={{ marginTop: 6 }} />
        <View style={styles.loadingRow}>
          <Skeleton height={78} radius={18} style={{ flex: 1 }} />
          <Skeleton height={78} radius={18} style={{ flex: 1 }} />
          <Skeleton height={78} radius={18} style={{ flex: 1 }} />
        </View>
        <Skeleton height={168} radius={18} style={{ marginTop: spacing.md }} />
        <Skeleton height={120} radius={18} style={{ marginTop: spacing.md }} />
        <Text style={[styles.loadingHint, { color: theme.colors.textMuted }]}>
          Déverrouillage de vos données chiffrées…
        </Text>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const theme = useTheme();

  // Relit la préférence d'apparence (Auto / Clair / Sombre) dès le lancement.
  useEffect(() => {
    void useThemePref.getState().hydrate();
  }, []);

  const [fontsLoaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
    SchibstedGrotesk_800ExtraBold,
  });

  if (!fontsLoaded) {
    // Même squelette que le déverrouillage : une seule expérience de chargement.
    return <DatabaseLoading />;
  }

  return (
    <SafeAreaProvider>
      <BiometricGate>
        <Suspense fallback={<DatabaseLoading />}>
          <SQLiteProvider databaseName={DATABASE_NAME} onInit={onDatabaseInit} useSuspense>
            <StatusBar style={theme.dark ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="nouvelle-transaction" options={{ presentation: 'modal' }} />
              <Stack.Screen name="nouveau-budget" options={{ presentation: 'modal' }} />
              <Stack.Screen name="budget-detail" options={{ presentation: 'modal' }} />
              <Stack.Screen name="nouveau-compte" options={{ presentation: 'modal' }} />
              <Stack.Screen name="virement" options={{ presentation: 'modal' }} />
              <Stack.Screen name="nouvelle-facture" options={{ presentation: 'modal' }} />
              <Stack.Screen name="nouvelle-categorie" options={{ presentation: 'modal' }} />
              <Stack.Screen name="categories" options={{ presentation: 'modal' }} />
              <Stack.Screen name="reglages" options={{ presentation: 'modal' }} />
            </Stack>
          </SQLiteProvider>
        </Suspense>
      </BiometricGate>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingColumn: {
    width: '100%',
    maxWidth: 560,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  loadingHint: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
