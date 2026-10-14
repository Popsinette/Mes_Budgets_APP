import { create } from 'zustand';
import { currentWeekKey, type WeekKey } from '@/src/utils/dates';

/** Semaine affichée sur l'écran « Ma semaine » (partagée : le bilan du mois peut y renvoyer). */
type WeekState = {
  week: WeekKey;
  setWeek: (week: WeekKey) => void;
};

export const useSelectedWeek = create<WeekState>((set) => ({
  week: currentWeekKey(),
  setWeek: (week) => set({ week }),
}));
