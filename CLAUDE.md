# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

App de suivi budgétaire **100 % locale et chiffrée**, calquée sur **Budgetiz** (méthode Deux Sœurs Un Agenda) : charges fixes planifiées, enveloppes **hebdomadaires**, poches d'épargne. Expo SDK 57 + TypeScript strict + expo-router. Trois cibles : iOS, Android, et web en PWA. Interface entièrement en français ; les commits sont rédigés en français.

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
- **Base de données** (`src/db/`) : ouverte par `SQLiteProvider` dans `app/_layout.tsx` avec `onDatabaseInit` — qui déverrouille SQLCipher (`PRAGMA key`, première instruction obligatoire, clé 32 octets dans SecureStore) puis exécute les migrations. Migrations versionnées par `PRAGMA user_version` dans `src/db/schema.ts` : pour changer le schéma, ajouter une migration `current < 11`, ne jamais modifier `SCHEMA_V10` ni `legacy.ts`.
- **Montants en centimes** (INTEGER) partout — colonnes `*_cents`, helpers `formatCents`/`parseAmountToCents` dans `src/utils/money.ts`. Jamais de flottants pour l'argent.
- **Périodes** : mois = `'yyyy-MM'` (`MonthKey`), semaine = date ISO de son lundi (`WeekKey`), helpers dans `src/utils/dates.ts`.
- **Trois axes indépendants, aucun lien croisé** (refonte V10 — l'ancien modèle catégories/transactions/budgets/factures liées est abandonné ; ne pas réintroduire de pont entre tables) :
  1. **Revenus & charges fixes** (`src/features/fixed/`, onglet « Mon mois », modale `fixe.tsx`) : `fixed_items` (`kind` income/charge, `day`, `frequency` monthly/quarterly/yearly/once, `start_month`, `end_month`), présence d'un mois calculée par `isDueIn`. Coche « reçu / prélevé » = une ligne `fixed_checks(item_id, month)`, rien d'autre. Supprimer un élément récurrent = l'**arrêter** à partir du mois affiché (`stopFixedItem`, `end_month`) pour garder l'historique.
  2. **Enveloppes hebdomadaires** (`src/features/envelopes/`, onglet « Semaine », modales `depense.tsx`, `enveloppe.tsx`) : `envelopes.weekly_cents` (Courses + Autres par défaut), `expenses` avec `week` = lundi de la semaine (`weekKeyOf`, dénormalisé, recalculé à chaque `saveExpense`). Semaine lundi → dimanche ; **une semaine appartient au mois de son lundi** (`weeksOfMonth`, 4 ou 5 semaines). Héros = « Il me reste jusqu'à dimanche » + € par jour. Une semaine terminée (et suivie : ≥ 1 dépense) propose de **mettre le reste de côté** (`closeWeek` → mouvement d'épargne avec `week`, + `week_closures`) ou « Pas cette fois ».
  3. **Épargne en poches** (`src/features/savings/`, onglet « Épargne », modales `poche.tsx`, `poche-detail.tsx`, `mouvement.tsx`) : `savings_pots` (`kind` securite = « Urgence & avenir » / projet = « Projets & pépins », `initial_cents`, `target_cents`, `monthly_cents`) ; solde = initial + Σ `savings_moves` (signés). Versement programmé du mois coché = un mouvement `plan_month` (index unique), décocher le supprime. Supprimer un mouvement de fin de semaine rouvre la semaine.
- **Plan du mois** (« Mon mois ») : **reste à vivre prévu = revenus − charges fixes − épargne programmée (Σ `monthly_cents`) − enveloppes (Σ `weekly_cents` × nb de semaines du mois)**. Puis la liste à cocher et le bilan semaine par semaine (toucher une semaine ouvre l'onglet Semaine dessus, store `src/store/week.ts`).
- **Migrations** : installation neuve → `SCHEMA_V10` directement (`seedDefaults`). Base existante (V1–V9) → chaîne héritée `src/db/legacy.ts` (figée) puis `CONVERT_V9` en une transaction : budgets → 2 enveloppes (Courses = « Alimentation », Autres = le reste, × 12/52), dépenses libres → dépenses, revenus → revenus ponctuels, factures → charges mensuelles + coches, comptes → poches, virements effectués → mouvements.
- **Web/PWA** : SQLCipher, SecureStore, Face ID et `Alert` n'existent pas sur web. Les gardes `Platform.OS === 'web'` sont dans `src/db/index.ts`, `BiometricGate`, `exporter.ts` et `reglages.tsx`. Utiliser `notify`/`confirmAction` (`src/utils/dialogs.ts`) au lieu de `Alert.alert` (muet sur web). Sur web, la persistance passe par OPFS (wasm) — `metro.config.js` déclare `.wasm` comme asset, ne pas le retirer.
- **Mois / semaine globaux** : `useSelectedMonth` (`src/store/month.ts`, Mon mois + Épargne) et `useSelectedWeek` (`src/store/week.ts`). Ne pas recréer de state local de période dans un écran ; les modales prennent `params.month` / `params.week`.
- **Affichage « reste d'abord »** : pour une enveloppe, le grand chiffre est **ce qu'il reste** (rouge si dépassé), « Dépensé X sur Y » en légende.
- **Icônes** : toutes dérivées de `assets/icon-source.webp` (illustration d'origine, plaque rose à coins arrondis sur fond blanc). Règles suivies pour les regénérer : recadrer sur la plaque, **icône pleine** (`assets/icon.png` 1024, `public/icons/icon.png` 512) sans coin blanc — iOS/Android posent leur propre masque ; `splash-icon.png` garde ses coins arrondis en transparence (il flotte sur le fond crème) ; Android adaptatif = avant-plan dans la zone sûre (~66 %) + fond rose plein (`#F8D8D8`, aussi dans `adaptiveIcon.backgroundColor`) ; PWA : une icône `maskable` en plus de `any` dans `public/manifest.json`. Changer une icône ⇒ incrémenter `CACHE_NAME` dans `public/sw.js`, sinon les appareils gardent l'ancienne en cache.
- **Navigation** : onglets dans `app/(tabs)/`, formulaires en modales à la racine de `app/` (déclarées dans `app/_layout.tsx`). `app/+html.tsx` porte les balises PWA (manifest, service worker) avec des chemins **relatifs** — requis pour GitHub Pages sous sous-chemin.
- **Design « Précision tranquille »** (refonte, déclinaison chaleureuse) : minimal/éditorial. Thème clair **crème/ivoire** au texte **brun**, thème sombre **cacao chaud** (jamais de noir) ; accents fonctionnels **sauge** (positif/revenu) et **terracotta** (dépense). Le **brun** (`primary`, crème sur fond sombre) est la couleur d'action (boutons, sélection, FAB). Pas de cartes en dégradé : les « héros » sont des grands montants typographiques posés sur le fond. Cartes plates (filet 1px, ombre quasi nulle).
- **Typographie** : deux polices Google chargées au runtime par `useFonts` dans `app/_layout.tsx` (paquets `@expo-google-fonts/schibsted-grotesk` et `instrument-sans` ; **pas** le plugin `expo-font` dans app.json — il casse l'export web). **Schibsted Grotesk** = titres + montants (chiffres tabulaires, la signature), **Instrument Sans** = corps. Jetons dans `src/theme` (`fonts.*`). **Toujours** passer par les composants de `src/components/ui/Text.tsx` (`Title`, `Heading`, `Eyebrow`, `Body`, `Caption`, `Money`) plutôt que `<Text>` brut : sur natif, `fontWeight` est ignoré pour les polices custom, il faut la bonne famille. `Money` prend `cents` + `signed` et formate lui-même. Sur-titres de section (`SectionHeader`) et libellés de formulaire = capitales espacées (eyebrow).
- **Design des données** : `categoryPalette` (src/theme) est **validée** contraste/daltonisme sur fond clair et sombre — ne pas réordonner ni ajouter de teinte sans revalider (`scripts/validate_palette.js` du skill dataviz). Les chiffres/labels restent en encre ou muted, jamais en couleur de série (la pastille/barre porte l'identité). Couleur par défaut d'une nouvelle enveloppe/poche : la teinte suivante de la palette (ordre fixe).
- **Thème** : `useTheme()` (`src/theme/`) combine le schéma système et la préférence utilisateur `useThemePref` (`src/store/themePref.ts`, Auto/Clair/Sombre, persistée SecureStore natif / localStorage web, hydratée au lancement dans `app/_layout.tsx`, réglable dans Réglages → Apparence) ; les couleurs viennent toujours du thème ou de la couleur d'enveloppe/poche en base, jamais en dur dans les écrans. Texte posé sur une surface encre (boutons, pastilles pleines) = `theme.colors.onAccent` / `onAccentMuted`.
- **Couleurs d'enveloppes/poches** : `categoryPalette` (`src/theme`) — 12 teintes sourdes accordées à l'encre/papier, proposées par `AppearancePicker` (`src/components/ui/`).
- **Interface premium** : le contenu des écrans est centré dans une colonne max 560 px (`Screen`) — mobile first, élégant sur tablette/desktop ; le `FAB` s'ancre à cette colonne. Les composants interactifs (Card, Button, Chip, FAB) ont des états hover (web) via le state Pressable (`hovered`, casté) et des `accessibilityRole/Label`. Chargement = `Skeleton` (pulsation 900 ms), jamais de spinner nu ; la jauge s'anime en 250 ms.
- **Jauges** (`ProgressBar`) : compteur horizontal arrondi ; dépassement → remplissage rouge. Prop optionnelle `markerRatio` = fin trait repère de « rythme » ; pour l'enveloppe de la semaine en cours on passe `weekPaceRatio(week)` (fraction de la semaine écoulée). Couleur : celle de l'enveloppe sous ~90 %, ambre proche, rouge au-delà.
- **Aperçu web** : `.claude/launch.json` déclare le serveur `web` (`npx expo start --web`) pour l'outil de preview ; utile pour vérifier le rendu (l'app native n'est pas visualisable ici).

## Déploiement

`.github/workflows/deploy-web.yml` publie la PWA sur GitHub Pages à chaque push (injecte `experiments.baseUrl = /<repo>` dans app.json avant l'export ; `dist/404.html` = copie d'index.html pour le routage SPA).
