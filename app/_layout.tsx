import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BiometricGate } from '@/src/components/BiometricGate';
import { DATABASE_NAME, onDatabaseInit } from '@/src/db';
import { spacing, useTheme } from '@/src/theme';

function DatabaseLoading() {
  const theme = useTheme();
  return (
    <View style={[styles.loading, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={{ color: theme.colors.textMuted }}>Déverrouillage des données…</Text>
    </View>
  );
}

export default function RootLayout() {
  const theme = useTheme();

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
    gap: spacing.md,
  },
});
