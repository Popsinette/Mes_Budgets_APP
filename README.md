# Mes Budgets 💜

Application mobile de suivi budgétaire **100 % locale et chiffrée**, pour iOS et Android — et aussi en **PWA installable** (utilisable sur iPhone sans compte développeur Apple).
Une seule base de code (React Native + Expo), une interface soignée, et aucune donnée qui ne quitte jamais votre téléphone.

## ✨ Fonctionnalités

Calquée sur **Budgetiz** (méthode Deux Sœurs Un Agenda) : simple, sans connexion bancaire.

- **Budget** — le mois et sa semaine en cours (« Semaine 2/4 »), en quatre onglets :
  - **Variables** : enveloppes hebdomadaires (Courses, Autres…) avec anneau de progression, reste du mois et de la semaine, dernières dépenses ;
  - **Fixes** : total · réglé · à débiter, postes mensuels (Essence, Garderie, Cantine…), charges à cocher (badge « en retard ») ;
  - **Revenus** : total · crédité · à créditer, revenus à cocher ;
  - **Santé** : avancé · remboursé · reste à charge, « Solder » quand le remboursement arrive.
- **Cagnottes** — « Projets & pépins » et « Urgence & avenir », objectif, date limite, versement mensuel à cocher — ou « Pas ce mois-ci » pour sauter un mois sans changer le montant —, prévisions du mois en % des revenus, historique des virements.
- **Analyse** — constats clés du mois (enveloppe dépassée, rythme trop rapide, cagnotte en retard, dépenses vs ta moyenne…), rythme du mois, semaine bouclée à mettre de côté, courbe d'épargne cumulée avec projection à 6 mois, moyennes, répartition par cagnotte.
- **Mon plan du mois** (Synthèse) — revenus − charges − postes − enveloppes − épargne programmée = reste à répartir, puis le reste prévisionnel avec les dépassements. Une **pastille** sur l'écran Budget passe au rouge dès que le mois l'est, et le formulaire de dépense prévient avant d'enregistrer.
- **Pointage des dépenses** — chaque dépense se coche quand elle est débitée sur ton compte : ton budget la compte dès la saisie, ton solde seulement une fois pointée, et la fin de mois retire celles encore « à pointer ».
- **Mon compte** — tu saisis le solde de ton compte courant une fois ; l'app le tient à jour avec ce que tu notes, coches et pointes, prévoit le solde de fin de mois et te montre l'écart avec ta banque.
- **Mes enveloppes** — chaque mois a ses propres enveloppes, sans lien avec les autres mois. **Ma base** (Courses, Essence, Plaisir…) est copiée dans chaque nouveau mois, puis tu ajustes librement (« Anniversaire » en novembre seulement, Courses plus haut en décembre…).
- **Clôturer le mois** — le mois fini, chaque enveloppe range son reste (dans une cagnotte ou sur le mois suivant) ou son dépassement (reporté sur le mois suivant ou repris d'une cagnotte). Un rappel apparaît sur l'écran Budget.
- **Mes dépenses** — toutes les dépenses du mois ou de tous les mois, avec recherche par libellé, enveloppe ou montant (« carrefour », « 23 »).
- **Les prochains mois** (Synthèse) — le plan de chaque mois à venir (revenus − charges − enveloppes − épargne), sans tenir compte du solde actuel.
- **Synthèse** — revenus, dépenses, solde, poste le plus dépensé, taux d'épargne, total des avoirs, répartition des dépenses.
- **Bouton +** — dépense, charge fixe, revenu, frais de santé ou virement d'épargne en un geste.
- **Sauvegarde** JSON à garder dans Fichiers / iCloud, **restauration** d'une sauvegarde (changement de téléphone, données du navigateur effacées), rappel au-delà de 30 jours ; export CSV des dépenses ; **verrouillage biométrique**, thème clair / sombre, interface en français.

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
app/
├── (tabs)/            index (Budget) · cagnottes · analyse · synthese (+ bouton central)
├── ajouter.tsx        Feuille du bouton + (dépense, charge, revenu, santé, virement)
├── depense.tsx · enveloppe.tsx · enveloppe-detail.tsx
├── fixe.tsx · sante.tsx
├── poche.tsx · poche-detail.tsx · mouvement.tsx · virements.tsx
└── reglages.tsx
src/
├── db/                Ouverture chiffrée, schéma V10 + V11, chaîne héritée (legacy.ts)
├── features/          envelopes · fixed · health · savings · summary · export
├── components/        ui/ (AppHeader, Segmented, StatTrio, CheckRow…) · charts/ (anneau, courbe, barres)
├── theme/ · store/ · utils/
```

## 🗄 Modèle de données

```
envelope_templates (id, name, icon, color, amount_cents, period)   « Ma base »
envelopes        (id, month, name, icon, color, weekly_cents, period, template_id)   propres au mois
envelope_months_ready (month)                              mois commencés (copie de la base faite)
expenses         (id, envelope_id, label, amount_cents, date, week = lundi)
fixed_items      (id, kind income|charge, name, amount_cents, day, frequency, start_month, end_month, icon)
fixed_checks     (item_id, month)                          coche « réglé / crédité »
health_expenses  (id, label, date, amount_cents, refund_cents, settled)
savings_pots     (id, name, icon, color, kind securite|projet, initial_cents, target_cents, monthly_cents, deadline)
savings_moves    (id, pot_id, amount_cents ±, date, note, plan_month, week)
week_closures    (week)                                    semaine bouclée
account          (id = 1, start_cents, start_at)            solde saisi depuis la banque
```

## 🚀 Démarrer

```bash
npm install

# Développement (Expo Go ne supporte pas SQLCipher : utiliser un development build)
npx expo prebuild                 # génère les projets natifs ios/ et android/
npx expo run:android              # ou : npx expo run:ios (sur macOS)

# Vérification des types
npm run typecheck
npm test                  # tests des calculs (Vitest, Node 22)
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
