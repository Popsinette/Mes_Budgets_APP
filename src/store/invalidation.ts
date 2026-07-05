import { create } from 'zustand';

/**
 * Compteur global d'invalidation : chaque mutation en base appelle `bump()`,
 * ce qui relance automatiquement toutes les requêtes `useLiveQuery` montées.
 */
type InvalidationState = {
  version: number;
  bump: () => void;
};

export const useInvalidation = create<InvalidationState>((set) => ({
  version: 0,
  bump: () => set((state) => ({ version: state.version + 1 })),
}));

export function invalidateQueries(): void {
  useInvalidation.getState().bump();
}
