# Mes Budgets 💜

Application mobile de suivi budgétaire **100 % locale et chiffrée**, pour iOS et Android.
Une seule base de code (React Native + Expo), une interface soignée, et aucune donnée qui ne quitte jamais votre téléphone.

## ✨ Fonctionnalités

- **Tableau de bord** — solde du mois (revenus − dépenses), répartition des dépenses par catégorie (graphique en anneau), aperçu des budgets, factures à venir et épargne.
- **Budgets mensuels** — un budget par catégorie et par mois, barres de progression avec alertes visuelles (orange à 85 %, rouge en dépassement), navigation de mois en mois, recopie des budgets du mois précédent en un geste.
- **Plan d'épargne** — objectifs d'épargne (vacances, voiture, fonds d'urgence…) avec montant cible, versement mensuel prévu, progression et historique des versements.
- **Factures** — factures récurrentes avec jour d'échéance, pointage payé/à payer mois par mois, total réglé sur le mois.
- **Transactions** — dépenses et revenus, catégorisés, avec notes.
- **Mode sombre** automatique, montants au format français (€), interface entièrement en français.

## 🔒 Sécurité et confidentialité

- **Stockage 100 % local** : aucune donnée n'est envoyée sur un serveur. Pas de compte, pas de cloud, pas de suivi.
- **Base chiffrée** : toutes les données sont stockées dans SQLite chiffré par **SQLCipher (AES-256)**, via `expo-sqlite` (option `useSQLCipher`).
- **Clé de chiffrement protégée** : une clé aléatoire de 32 octets est générée au premier lancement (`expo-crypto`) et conservée exclusivement dans le **Keychain iOS / Keystore Android** (`expo-secure-store`). Elle ne figure ni dans le code, ni dans un fichier.
- **Montants en centimes** (entiers) : aucun risque d'erreur d'arrondi en virgule flottante.

## 🛠 Stack technique

| Domaine | Choix |
|---|---|
| Framework | [Expo](https://expo.dev) SDK 57 · React Native 0.86 · TypeScript strict |
| Navigation | [expo-router](https://docs.expo.dev/router/introduction/) (onglets + modales) |
| Base de données | `expo-sqlite` + SQLCipher, migrations versionnées (`PRAGMA user_version`) |
| Sécurité | `expo-secure-store` (Keychain/Keystore) + `expo-crypto` |
| État | Zustand (invalidation des requêtes) + hooks `useLiveQuery` |
| Graphiques | `react-native-svg` (anneau des dépenses, léger et sans dépendance lourde) |
| Dates | `date-fns` (locale française) |

## 📁 Arborescence

```
Mes_Budgets_APP/
├── app/                          # Écrans (routage par fichiers — expo-router)
│   ├── _layout.tsx               # Racine : SQLiteProvider (base chiffrée) + pile de navigation
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Barre d'onglets
│   │   ├── index.tsx             # 🏠 Tableau de bord
│   │   ├── budgets.tsx           # 💰 Budgets mensuels par catégorie
│   │   ├── epargne.tsx           # 📈 Plan d'épargne et objectifs
│   │   └── factures.tsx          # 🧾 Factures récurrentes
│   ├── nouvelle-transaction.tsx  # Modale : dépense / revenu
│   ├── nouveau-budget.tsx        # Modale : budget mensuel d'une catégorie
│   ├── nouvel-objectif.tsx       # Modale : objectif d'épargne
│   ├── verser.tsx                # Modale : versement sur un objectif
│   ├── nouvelle-facture.tsx      # Modale : facture récurrente
│   └── reglages.tsx              # Modale : sécurité, effacement des données
├── src/
│   ├── db/
│   │   ├── index.ts              # Ouverture de la base + PRAGMA key (SQLCipher)
│   │   ├── key.ts                # Génération/lecture de la clé dans le Keychain/Keystore
│   │   ├── schema.ts             # Schéma SQL, migrations, catégories par défaut
│   │   └── useLiveQuery.ts       # Requêtes réactives (relancées après chaque mutation)
│   ├── features/                 # Accès aux données, par domaine métier
│   │   ├── categories/repository.ts
│   │   ├── transactions/repository.ts
│   │   ├── budgets/repository.ts
│   │   ├── savings/repository.ts
│   │   └── bills/repository.ts
│   ├── components/
│   │   ├── ui/                   # Card, Button, FAB, ProgressBar, MonthSwitcher,
│   │   │                         # CategoryPicker, FormField, EmptyState…
│   │   └── charts/DonutChart.tsx # Anneau SVG des dépenses par catégorie
│   ├── theme/index.ts            # Palette clair/sombre, espacements, rayons
│   ├── store/invalidation.ts     # Compteur global d'invalidation (Zustand)
│   └── utils/
│       ├── money.ts              # Format € (fr-FR), parsing de saisie, centimes
│       └── dates.ts              # Clés de mois 'yyyy-MM', libellés français
├── assets/                       # Icônes et splash screen
├── app.json                      # Config Expo (plugins : expo-router, SQLCipher, splash)
├── package.json
└── tsconfig.json                 # TypeScript strict + alias @/
```

## 🗄 Modèle de données

```
categories        (id, name, icon, color, sort_order)
transactions      (id, category_id, label, amount_cents, type, date, month, note)
budgets           (id, category_id, month 'yyyy-MM', amount_cents)   UNIQUE(category_id, month)
savings_goals     (id, name, icon, color, target_cents, monthly_cents, created_at)
savings_entries   (id, goal_id, amount_cents, date, note)
bills             (id, name, amount_cents, due_day, category_id, active, created_at)
bill_payments     (id, bill_id, month 'yyyy-MM', paid_at)            UNIQUE(bill_id, month)
```

## 🚀 Démarrer

```bash
npm install

# Développement (Expo Go ne supporte pas SQLCipher : utiliser un development build)
npx expo prebuild                 # génère les projets natifs ios/ et android/
npx expo run:android              # ou : npx expo run:ios (sur macOS)

# Vérification des types
npm run typecheck
```

> ⚠️ **Important** : le chiffrement SQLCipher nécessite un *development build*
> (`expo prebuild` + `expo run:*` ou EAS Build). L'app ne fonctionnera pas dans Expo Go.

## 📲 Publication

```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```
