import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const BIOMETRIC_PREF_KEY = 'mesbudgets.biometric.enabled';

type SecurityState = {
  /** null tant que la préférence n'est pas chargée depuis le stockage sécurisé. */
  biometricEnabled: boolean | null;
  /** Session déverrouillée (repasse à false quand l'app part en arrière-plan). */
  unlocked: boolean;
  hydrate: () => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  lock: () => void;
  /** Lance l'authentification Face ID / empreinte. Renvoie true si déverrouillé. */
  tryUnlock: () => Promise<boolean>;
};

export const useSecurity = create<SecurityState>((set, get) => ({
  biometricEnabled: null,
  unlocked: false,

  hydrate: async () => {
    const pref = await SecureStore.getItemAsync(BIOMETRIC_PREF_KEY);
    const enabled = pref === '1';
    set({ biometricEnabled: enabled, unlocked: !enabled });
  },

  setBiometricEnabled: async (enabled: boolean) => {
    await SecureStore.setItemAsync(BIOMETRIC_PREF_KEY, enabled ? '1' : '0');
    set({ biometricEnabled: enabled, unlocked: true });
  },

  lock: () => {
    if (get().biometricEnabled) set({ unlocked: false });
  },

  tryUnlock: async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Déverrouiller Mes Budgets',
      cancelLabel: 'Annuler',
    });
    if (result.success) set({ unlocked: true });
    return result.success;
  },
}));

/** L'appareil propose-t-il une biométrie configurée (Face ID, Touch ID, empreinte) ? */
export async function isBiometricAvailable(): Promise<boolean> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
}
