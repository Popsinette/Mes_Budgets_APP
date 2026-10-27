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

  // Relit les préférences persistées (apparence) dès le lancement.
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
              <Stack.Screen name="ajouter" options={{ presentation: 'modal' }} />
              <Stack.Screen name="cloture" options={{ presentation: 'modal' }} />
              <Stack.Screen name="compte" options={{ presentation: 'modal' }} />
              <Stack.Screen name="depense" options={{ presentation: 'modal' }} />
              <Stack.Screen name="depenses" options={{ presentation: 'modal' }} />
              <Stack.Screen name="enveloppe-detail" options={{ presentation: 'modal' }} />
              <Stack.Screen name="enveloppes" options={{ presentation: 'modal' }} />
              <Stack.Screen name="sante" options={{ presentation: 'modal' }} />
              <Stack.Screen name="virements" options={{ presentation: 'modal' }} />
              <Stack.Screen name="enveloppe" options={{ presentation: 'modal' }} />
              <Stack.Screen name="fixe" options={{ presentation: 'modal' }} />
              <Stack.Screen name="habitudes" options={{ presentation: 'modal' }} />
              <Stack.Screen name="annee" options={{ presentation: 'modal' }} />
              <Stack.Screen name="poche" options={{ presentation: 'modal' }} />
              <Stack.Screen name="poche-detail" options={{ presentation: 'modal' }} />
              <Stack.Screen name="mouvement" options={{ presentation: 'modal' }} />
              <Stack.Screen name="versement" options={{ presentation: 'modal' }} />
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
