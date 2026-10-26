import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useTheme } from '@/src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={26} color={color as string} />
  );
}

/** Bouton + central, en relief au-dessus de la barre (dégradé lavande → pivoine) : ouvre le choix d'ajout. */
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
        style={({ pressed }) => [styles.add, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
      >
        <LinearGradient
          colors={theme.dark ? ['#A99EF0', '#F0A9C3'] : ['#7B6FD8', '#D97A9E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.addFill}
        >
          <Ionicons name="add" size={32} color={theme.dark ? '#16161F' : '#FFFFFF'} />
        </LinearGradient>
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
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopWidth: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          height: 74,
          paddingTop: 10,
          shadowColor: theme.dark ? '#000' : '#5B4FC4',
          shadowOpacity: theme.dark ? 0.3 : 0.08,
          shadowRadius: 16,
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
  addFill: {
    flex: 1,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSlot: {
    flex: 1,
    alignItems: 'center',
  },
  add: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginTop: -30,
    shadowColor: '#5B4FC4',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
