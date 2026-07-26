import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/**
 * Méthode de budget choisie pour le budget type (inspiré du glow-up budget) :
 * - « 50-30-20 » : 50 % besoins, 30 % envies, 20 % épargne (la référence) ;
 * - « 80-20 » : 80 % pour vivre (besoins + envies), 20 % d'épargne d'abord ;
 * - « zero » : base zéro — chaque euro reçoit un poste, reste à répartir 0.
 * Persistée localement (SecureStore natif, localStorage web).
 */
export type BudgetMethod = '50-30-20' | '80-20' | 'zero';

const METHOD_KEY = 'mesbudgets.method';

function isMethod(value: unknown): value is BudgetMethod {
  return value === '50-30-20' || value === '80-20' || value === 'zero';
}

type BudgetMethodState = {
  method: BudgetMethod;
  hydrate: () => Promise<void>;
  setMethod: (method: BudgetMethod) => void;
};

export const useBudgetMethod = create<BudgetMethodState>((set) => ({
  method: '50-30-20',

  hydrate: async () => {
    try {
      const stored =
        Platform.OS === 'web'
          ? window.localStorage.getItem(METHOD_KEY)
          : await SecureStore.getItemAsync(METHOD_KEY);
      if (isMethod(stored)) set({ method: stored });
    } catch {
      // Stockage indisponible : on garde la référence 50/30/20.
    }
  },

  setMethod: (method) => {
    set({ method });
    void (async () => {
      try {
        if (Platform.OS === 'web') {
          window.localStorage.setItem(METHOD_KEY, method);
        } else {
          await SecureStore.setItemAsync(METHOD_KEY, method);
        }
      } catch {
        // Échec de persistance : le choix vaut pour la session en cours.
      }
    })();
  },
}));
