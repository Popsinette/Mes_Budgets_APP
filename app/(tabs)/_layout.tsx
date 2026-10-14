import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, Tabs } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useTheme } from '@/src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={26} color={color as string} />
  );
}

/** Bouton + central, en relief au-dessus de la barre : ouvre le choix d'ajout. */
function AddButton() {
  const theme = useTheme();
  return (
    <View style={styles.addSlot}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/ajouter');
        }}
        accessibilityRole="button"
        accessibilityLabel="Ajouter"
        style={({ pressed }) => [
          styles.add,
          { backgroundColor: theme.colors.secondary, transform: [{ scale: pressed ? 0.94 : 1 }] },
        ]}
      >
        <Ionicons name="add" size={32} color={theme.colors.onAccent} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.text,
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopWidth: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          height: 74,
          paddingTop: 10,
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -2 },
          elevation: 8,
          position: 'absolute',
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Budget', tabBarAccessibilityLabel: 'Budget', tabBarIcon: tabIcon('layers', 'layers-outline') }} />
      <Tabs.Screen
        name="cagnottes"
        options={{ title: 'Cagnottes', tabBarAccessibilityLabel: 'Cagnottes', tabBarIcon: tabIcon('bag-handle', 'bag-handle-outline') }}
      />
      <Tabs.Screen
        name="ajouter-onglet"
        options={{ title: 'Ajouter', tabBarButton: () => <AddButton /> }}
        listeners={{ tabPress: (e) => e.preventDefault() }}
      />
      <Tabs.Screen
        name="analyse"
        options={{ title: 'Analyse', tabBarAccessibilityLabel: 'Analyse', tabBarIcon: tabIcon('analytics', 'analytics-outline') }}
      />
      <Tabs.Screen
        name="synthese"
        options={{ title: 'Synthèse', tabBarAccessibilityLabel: 'Synthèse', tabBarIcon: tabIcon('pie-chart', 'pie-chart-outline') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  addSlot: {
    flex: 1,
    alignItems: 'center',
  },
  add: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginTop: -30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
