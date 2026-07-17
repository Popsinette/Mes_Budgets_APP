import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/**
 * Préférence d'apparence : « auto » suit le réglage du téléphone,
 * « light »/« dark » forcent le thème dans l'app. Persistée localement
 * (SecureStore sur natif, localStorage sur web).
 */
export type ThemePref = 'auto' | 'light' | 'dark';

const PREF_KEY = 'mesbudgets.theme';

function isPref(value: unknown): value is ThemePref {
  return value === 'auto' || value === 'light' || value === 'dark';
}

type ThemePrefState = {
  pref: ThemePref;
  hydrate: () => Promise<void>;
  setPref: (pref: ThemePref) => void;
};

export const useThemePref = create<ThemePrefState>((set) => ({
  pref: 'auto',

  hydrate: async () => {
    try {
      const stored =
        Platform.OS === 'web'
          ? window.localStorage.getItem(PREF_KEY)
          : await SecureStore.getItemAsync(PREF_KEY);
      if (isPref(stored)) set({ pref: stored });
    } catch {
      // Stockage indisponible : on reste en « auto ».
    }
  },

  setPref: (pref) => {
    set({ pref });
    void (async () => {
      try {
        if (Platform.OS === 'web') {
          window.localStorage.setItem(PREF_KEY, pref);
        } else {
          await SecureStore.setItemAsync(PREF_KEY, pref);
        }
      } catch {
        // Échec de persistance : la préférence vaut pour la session en cours.
      }
    })();
  },
}));
