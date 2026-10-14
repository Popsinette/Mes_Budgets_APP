# Mes Budgets 💜

Application mobile de suivi budgétaire **100 % locale et chiffrée**, pour iOS et Android — et aussi en **PWA installable** (utilisable sur iPhone sans compte développeur Apple).
Une seule base de code (React Native + Expo), une interface soignée, et aucune donnée qui ne quitte jamais votre téléphone.

## ✨ Fonctionnalités

Inspirée de **Budgetiz** (méthode Deux Sœurs Un Agenda) : simple, sans connexion bancaire, trois axes.

- **Ma semaine** — des enveloppes hebdomadaires (Courses et Autres par défaut, d'autres au besoin). On note chaque achat ; le grand chiffre dit **ce qu'il reste jusqu'à dimanche**, et combien par jour. En fin de semaine, le reste se **met de côté** dans une poche d'épargne en un geste.
- **Mon mois** — revenus et charges fixes planifiés (loyer, factures, abonnements, assurance annuelle…), mensuels, trimestriels, annuels ou ponctuels, à **cocher** quand ils sont reçus / prélevés (badges « en retard » / « bientôt »). Le plan du mois : revenus − charges − épargne programmée − enveloppes = **reste à vivre prévu**, puis le bilan semaine par semaine.
- **Mon épargne** — des poches « Urgence & avenir » (sécurité) et « Projets & pépins » (vacances, réparations, cadeaux…), avec objectif, versement mensuel programmé à cocher, dépôts / retraits et historique.
- **Export des données** — sauvegarde complète en JSON ou dépenses en CSV (Excel/Numbers), via la feuille de partage du système.
- **Verrouillage biométrique** — Face ID / Touch ID / empreinte, reverrouillage en arrière-plan.
- **Thème clair / sombre**, montants au format français, interface entièrement en français.

## 🔒 Sécurité et confidentialité

- **Stockage 100 % local** : aucune donnée n'est envoyée sur un serveur. Pas de compte, pas de cloud, pas de suivi.
- **Base chiffrée** : toutes les données sont stockées dans SQLite chiffré par **SQLCipher (AES-256)**, via `expo-sqlite` (option `useSQLCipher`).
- **Clé de chiffrement protégée** : une clé aléatoire de 32 octets est générée au premier lancement (`expo-crypto`) et conservée exclusivement dans le **Keychain iOS / Keystore Android** (`expo-secure-store`). Elle ne figure ni dans le code, ni dans un fichier.
- **Verrouillage biométrique** : Face ID / Touch ID / empreinte via `expo-local-authentication`, avec reverrouillage automatique en arrière-plan.
- **Montants en centimes** (entiers) : aucun risque d'erreur d'arrondi en virgule flottante.

## 🛠 Stack technique

| Domaine | Choix |
|---|---|
| Framework | [Expo](https://expo.dev) SDK 57 · React Native 0.86 · TypeScript strict |
| Navigation | [expo-router](https://docs.expo.dev/router/introduction/) (onglets + modales) |
| Base de données | `expo-sqlite` + SQLCipher, migrations versionnées (`PRAGMA user_version`) |
| Sécurité | `expo-secure-store` (Keychain/Keystore) + `expo-crypto` + `expo-local-authentication` |
| Export | `expo-file-system` + `expo-sharing` (feuille de partage système) |
| État | Zustand (invalidation des requêtes) + hooks `useLiveQuery` |
| Dates | `date-fns` (locale française) |

## 📁 Arborescence

```
Mes_Budgets_APP/
├── app/                          # Écrans (routage par fichiers — expo-router)
│   ├── _layout.tsx               # Racine : SQLiteProvider (base chiffrée) + pile de navigation
│   ├── (tabs)/
│   │   ├── index.tsx             # 👛 Ma semaine : enveloppes, reste jusqu'à dimanche, dépenses
│   │   ├── mois.tsx              # 📅 Mon mois : plan, revenus et charges fixes à cocher, semaines
│   │   └── epargne.tsx           # 🌿 Mon épargne : poches, versements programmés
│   ├── depense.tsx               # Modale : dépense (enveloppe, jour de la semaine)
│   ├── enveloppe.tsx             # Modale : enveloppe hebdomadaire
│   ├── fixe.tsx                  # Modale : revenu / charge fixe planifié
│   ├── poche.tsx                 # Modale : poche d'épargne
│   ├── poche-detail.tsx          # Modale : solde, objectif, historique d'une poche
│   ├── mouvement.tsx             # Modale : dépôt / retrait / reste de la semaine
│   └── reglages.tsx              # Modale : apparence, sécurité, export, effacement
├── src/
│   ├── db/                       # Ouverture chiffrée, schéma V10, chaîne héritée (legacy.ts)
│   ├── features/                 # envelopes/, fixed/, savings/, export/
│   ├── components/               # BiometricGate + ui/ (Card, Button, FAB, ProgressBar…)
│   ├── theme/index.ts            # Palette clair/sombre, typographie, espacements
│   ├── store/                    # Mois / semaine affichés, invalidation, thème, sécurité
│   └── utils/                    # Montants (centimes), dates (mois, semaines lundi → dimanche)
└── app.json                      # Config Expo (plugins : expo-router, SQLCipher, splash)
```

## 🗄 Modèle de données

```
envelopes      (id, name, icon, color, weekly_cents, sort_order)
expenses       (id, envelope_id, label, amount_cents, date, week = lundi)
fixed_items    (id, kind income|charge, name, amount_cents, day, frequency, start_month, end_month)
fixed_checks   (item_id, month)                                   coche « reçu / prélevé »
savings_pots   (id, name, icon, color, kind securite|projet, initial_cents, target_cents, monthly_cents)
savings_moves  (id, pot_id, amount_cents ±, date, note, plan_month, week)
week_closures  (week)                                             semaine soldée
```

Une base créée par une version précédente est convertie automatiquement au premier lancement (budgets → enveloppes, factures → charges fixes, comptes → poches).

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

## 📱 Utiliser sur iPhone sans compte développeur Apple (PWA)

Apple facture 99 €/an pour installer des apps natives durablement. La parade : la **version web installable (PWA)**, qui se comporte comme une app native une fois épinglée sur l'écran d'accueil.

### 1. Publier la PWA (une seule fois)

Le dépôt contient un workflow GitHub Actions (`.github/workflows/deploy-web.yml`) qui construit et déploie la version web à chaque push :

1. Rendre le dépôt **public** (GitHub Pages gratuit ne fonctionne pas sur un dépôt privé), ou utiliser Netlify (gratuit, dépôts privés acceptés).
2. Sur GitHub : **Settings → Pages → Source : « GitHub Actions »**.
3. Pousser (ou relancer le workflow depuis l'onglet Actions).
4. L'app est en ligne sur `https://<votre-compte>.github.io/Mes_Budgets_APP/`.

Alternative sans GitHub Pages : `npx expo export --platform web` puis glisser le dossier `dist/` sur [Netlify Drop](https://app.netlify.com/drop).

### 2. Installer sur l'iPhone

1. Ouvrir l'URL dans **Safari**.
2. Bouton **Partager** → **« Sur l'écran d'accueil »**.
3. L'icône Mes Budgets apparaît : l'app s'ouvre en plein écran, fonctionne **hors ligne** (service worker) et garde ses données **localement sur le téléphone** (stockage OPFS du navigateur, isolé par site).

### Différences avec la version native

| | Native (iOS/Android) | PWA (web) |
|---|---|---|
| Stockage local | ✅ SQLite + SQLCipher (AES-256) | ✅ SQLite (wasm) dans le stockage privé du navigateur |
| Face ID au lancement | ✅ | ➖ (protégé par le verrouillage de l'iPhone) |
| Hors ligne | ✅ | ✅ |
| Export JSON/CSV | ✅ feuille de partage | ✅ partage ou téléchargement |
| Installation | Compte développeur requis (iOS) | ✅ gratuite, depuis Safari |

> 💡 Pensez à exporter régulièrement une sauvegarde JSON depuis les réglages : si Mes Budgets est supprimé de l'écran d'accueil ou les données de Safari effacées, le stockage local part avec.

## 📲 Publication native (App Store / Play Store)

```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```
