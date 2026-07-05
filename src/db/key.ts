import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DB_KEY_NAME = 'mesbudgets.db.key';

/**
 * Récupère (ou génère au premier lancement) la clé de chiffrement SQLCipher.
 * La clé — 32 octets aléatoires — n'existe que dans le Keychain iOS / Keystore Android,
 * jamais dans le code ni dans un fichier.
 */
export async function getOrCreateDatabaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DB_KEY_NAME);
  if (existing) return existing;

  const bytes = await Crypto.getRandomBytesAsync(32);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  await SecureStore.setItemAsync(DB_KEY_NAME, hex, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return hex;
}
