import { create } from 'zustand';
import { currentMonthKey, type MonthKey } from '@/src/utils/dates';

/**
 * Mois sélectionné, partagé par toute l'application : changer de mois sur un
 * écran (Accueil, Activité, Budgets, Épargne, Factures) change la vue partout.
 */
type MonthState = {
  month: MonthKey;
  setMonth: (month: MonthKey) => void;
};

export const useSelectedMonth = create<MonthState>((set) => ({
  month: currentMonthKey(),
  setMonth: (month) => set({ month }),
}));
