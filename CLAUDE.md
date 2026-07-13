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
- **Factures récurrentes** : pointer une facture payée (`setBillPaid`) crée la transaction de dépense du mois (datée du jour d'échéance) et stocke son id dans `bill_payments.transaction_id` ; dé-pointer supprime cette transaction. Ne pas créer d'autre chemin de pointage qui contournerait ce lien. La transaction porte aussi `bill_id` : les dépenses de factures sont **exclues du suivi des budgets** (`WHERE t.bill_id IS NULL` dans `listBudgetsWithSpending`) mais comptent dans le solde et le total dépensé.
- **Épargne = comptes + virements** (migration V4) : `savings_accounts` (nom, icône, couleur, `initial_cents` = valeur de départ déjà cumulée, `target_cents`/`monthly_cents` optionnels) et `savings_transfers` (rattachés à un compte, `month`, `done` 0/1). Solde réel = `initial + Σ virements done=1` ; prévisionnel = `initial + Σ tous`. Coche `setTransferDone` comme les factures. Écrans : `nouveau-compte.tsx` (CRUD + valeur de départ), `virement.tsx` (choix du compte + coche « effectué »).
- **Pointage des opérations** (migration V5) : colonne `cleared` sur `transactions` (0 = à venir / en attente sur le compte, 1 = passée / pointée). Défaut **1** (historique et dépenses de factures = déjà passées). On saisit une dépense « à venir » dès qu'on la fait (`nouvelle-transaction.tsx`, toggle « À venir / Déjà passée », défaut à venir), puis on la **pointe** d'un tap sur le cercle dans `operations.tsx` (`setTransactionCleared`, coche comme factures/épargne). **Solde réel** = Σ opérations `cleared=1` **− épargne réellement virée du mois** (les virements/retraits d'épargne passent par le compte courant) ; **prévisionnel fin de mois** = Σ toutes les opérations **− factures restant à payer − toute l'épargne du mois** (projection). Mêmes formules sur l'accueil et l'écran Opérations — ne pas les faire diverger. `getMonthTotals` renvoie les agrégats (`cleared_income_cents`/`cleared_expense_cents` + `pending_count`). Écran Opérations : cartes Réel/Prévisionnel, sections « À pointer » / « Pointées ».
- **Reste à vivre** (accueil), deux valeurs : **prévisionnel** = `revenus − total factures − budgets alloués − épargne prévue du mois` (`getPlannedSavingsForMonth`, tous virements du mois) ; **réel** = le solde réel pointé (déjà net de l'épargne virée, `getRealSavingsForMonth`, virements `done=1`).
- **Catégories personnalisables** : CRUD complet dans `categories/repository.ts`. Supprimer une catégorie met ses transactions/factures à `NULL` (SET NULL) et supprime ses budgets (CASCADE). Écran de gestion `app/categories.tsx` (depuis Réglages) + création rapide depuis le `CategoryPicker` (bouton « Nouvelle »).
- **Web/PWA** : SQLCipher, SecureStore, Face ID et `Alert` n'existent pas sur web. Les gardes `Platform.OS === 'web'` sont dans `src/db/index.ts`, `BiometricGate`, `exporter.ts` et `reglages.tsx`. Utiliser `notify`/`confirmAction` (`src/utils/dialogs.ts`) au lieu de `Alert.alert` (muet sur web). Sur web, la persistance passe par OPFS (wasm) — `metro.config.js` déclare `.wasm` comme asset, ne pas le retirer.
- **Détail d'un budget** : toucher un budget (`budgets.tsx`) ouvre `app/budget-detail.tsx` (modale) qui liste les dépenses de la catégorie pour le mois via `listBudgetExpenses` (mêmes règles que le calcul du budget : `bill_id IS NULL`, dépenses libres). On peut y pointer/supprimer une dépense, et modifier/supprimer le budget. L'édition du budget reste `nouveau-budget.tsx`.
- **Navigation** : onglets dans `app/(tabs)/`, formulaires en modales à la racine de `app/` (déclarées dans `app/_layout.tsx`). `app/+html.tsx` porte les balises PWA (manifest, service worker) avec des chemins **relatifs** — requis pour GitHub Pages sous sous-chemin.
- **Design « Précision tranquille »** (refonte) : minimal/éditorial, palette neutre encre + accents fonctionnels (vert = positif/revenu, brique = dépense) ; l'**encre** (`primary`) est la couleur d'action (boutons, sélection, FAB), pas d'accent violet. Pas de cartes en dégradé : les « héros » sont des grands montants typographiques posés sur le fond. Cartes plates (filet 1px, ombre quasi nulle).
- **Typographie** : deux polices Google chargées au runtime par `useFonts` dans `app/_layout.tsx` (paquets `@expo-google-fonts/schibsted-grotesk` et `instrument-sans` ; **pas** le plugin `expo-font` dans app.json — il casse l'export web). **Schibsted Grotesk** = titres + montants (chiffres tabulaires, la signature), **Instrument Sans** = corps. Jetons dans `src/theme` (`fonts.*`). **Toujours** passer par les composants de `src/components/ui/Text.tsx` (`Title`, `Heading`, `Eyebrow`, `Body`, `Caption`, `Money`) plutôt que `<Text>` brut : sur natif, `fontWeight` est ignoré pour les polices custom, il faut la bonne famille. `Money` prend `cents` + `signed` et formate lui-même. Sur-titres de section (`SectionHeader`) et libellés de formulaire = capitales espacées (eyebrow).
- **Thème** : `useTheme()` (`src/theme/`) clair/sombre automatique ; les couleurs viennent toujours du thème ou de la couleur de catégorie en base, jamais en dur dans les écrans. Texte posé sur une surface encre (boutons, pastilles pleines) = `theme.colors.onAccent` / `onAccentMuted`.
- **Couleurs de catégories/comptes** : `categoryPalette` (`src/theme`) — 12 teintes **sourdes/désaturées** (terracotta, ocre, sauge, océan, indigo, prune…) accordées à l'encre/papier, utilisées par les sélecteurs de `nouvelle-categorie.tsx` / `nouveau-compte.tsx` et par `DEFAULT_CATEGORIES`. La migration V6 (`COLOR_REMAP` dans `schema.ts`) reteinte les catégories/comptes existants qui portaient encore un ancien hex par défaut (les couleurs choisies à la main sont conservées).
- **Jauges** (`ProgressBar`) : compteur horizontal arrondi ; dépassement → remplissage rouge. Prop optionnelle `markerRatio` = fin trait repère de « rythme » ; pour un budget du mois courant on passe `monthPaceRatio(month)` (`src/utils/dates`, fraction du mois écoulée) pour voir d'un coup d'œil si on dépense trop vite. Couleur de barre pilotée par l'appelant : catégorie sous ~90 %, ambre proche, rouge au-delà (budgets), vert pour le total budget quand on est dans les clous.
- **Aperçu web** : `.claude/launch.json` déclare le serveur `web` (`npx expo start --web`) pour l'outil de preview ; utile pour vérifier le rendu (l'app native n'est pas visualisable ici).

## Déploiement

`.github/workflows/deploy-web.yml` publie la PWA sur GitHub Pages à chaque push (injecte `experiments.baseUrl = /<repo>` dans app.json avant l'export ; `dist/404.html` = copie d'index.html pour le routage SPA).
