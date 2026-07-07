# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

App de suivi budgétaire (budgets mensuels, plan d'épargne, factures) **100 % locale et chiffrée**. Expo SDK 57 + TypeScript strict + expo-router. Trois cibles : iOS, Android, et web en PWA. Interface entièrement en français ; les commits sont rédigés en français.

## Commandes

```bash
npm run typecheck                 # tsc --noEmit — à lancer après toute modification
npx expo export --platform web    # build web (dist/) — vérifie aussi que le bundle passe
npx expo start                    # serveur de dev (web ou dev build natif)
npx expo prebuild                 # génère ios/ et android/ (non versionnés)
```

Il n'y a pas de tests ni de linter configurés. La vérification = typecheck + export (web et/ou android) sans erreur.

**Expo Go ne fonctionne pas** : SQLCipher est natif, il faut un development build (`expo run:android` / `run:ios`).

## Architecture

Flux de données : écrans (`app/`) → `useLiveQuery` → repositories (`src/features/*/repository.ts`) → SQLite chiffré.

- **Réactivité** : pas de cache ni de state manager pour les données. Chaque mutation dans un repository appelle `invalidateQueries()` (`src/store/invalidation.ts`, compteur Zustand) ; tous les `useLiveQuery` montés re-exécutent alors leur requête SQL. Toute nouvelle mutation DOIT appeler `invalidateQueries()`.
- **Base de données** (`src/db/`) : ouverte par `SQLiteProvider` dans `app/_layout.tsx` avec `onDatabaseInit` — qui déverrouille SQLCipher (`PRAGMA key`, première instruction obligatoire, clé 32 octets dans SecureStore) puis exécute les migrations. Migrations versionnées par `PRAGMA user_version` dans `src/db/schema.ts` : pour changer le schéma, ajouter une migration `current < N`, ne jamais modifier `MIGRATION_V1`.
- **Montants en centimes** (INTEGER) partout — colonnes `*_cents`, helpers `formatCents`/`parseAmountToCents` dans `src/utils/money.ts`. Jamais de flottants pour l'argent.
- **Mois** : clés `'yyyy-MM'` (`MonthKey`, `src/utils/dates.ts`), dénormalisées dans la colonne `month` des transactions pour les agrégats SQL.
- **Factures récurrentes** : pointer une facture payée (`setBillPaid`) crée la transaction de dépense du mois (datée du jour d'échéance) et stocke son id dans `bill_payments.transaction_id` ; dé-pointer supprime cette transaction. Ne pas créer d'autre chemin de pointage qui contournerait ce lien.
- **Web/PWA** : SQLCipher, SecureStore, Face ID et `Alert` n'existent pas sur web. Les gardes `Platform.OS === 'web'` sont dans `src/db/index.ts`, `BiometricGate`, `exporter.ts` et `reglages.tsx`. Utiliser `notify`/`confirmAction` (`src/utils/dialogs.ts`) au lieu de `Alert.alert` (muet sur web). Sur web, la persistance passe par OPFS (wasm) — `metro.config.js` déclare `.wasm` comme asset, ne pas le retirer.
- **Navigation** : onglets dans `app/(tabs)/`, formulaires en modales à la racine de `app/` (déclarées dans `app/_layout.tsx`). `app/+html.tsx` porte les balises PWA (manifest, service worker) avec des chemins **relatifs** — requis pour GitHub Pages sous sous-chemin.
- **Thème** : `useTheme()` (`src/theme/`) clair/sombre automatique ; les couleurs viennent toujours du thème ou de la couleur de catégorie en base, jamais en dur dans les écrans.

## Déploiement

`.github/workflows/deploy-web.yml` publie la PWA sur GitHub Pages à chaque push (injecte `experiments.baseUrl = /<repo>` dans app.json avant l'export ; `dist/404.html` = copie d'index.html pour le routage SPA).
