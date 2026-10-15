import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests des calculs (repositories + utilitaires) sur une vraie base SQLite en
// mémoire (`node:sqlite`, Node ≥ 22) : aucune dépendance à react-native.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // node:sqlite est encore « expérimental » : on masque l'avertissement.
    poolOptions: { forks: { execArgv: ['--disable-warning=ExperimentalWarning'] } },
  },
});
