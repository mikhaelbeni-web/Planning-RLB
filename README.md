# 📅 Planning — Résidence Le Belleville

Application web de planning interne. Temps réel via Firebase, déployée sur Vercel.

---

## 🚀 Déploiement en 4 étapes

### Étape 1 — Créer la base de données Firebase (5 min)

1. Aller sur [https://console.firebase.google.com](https://console.firebase.google.com)
2. Cliquer **"Ajouter un projet"** → nom : `planning-rlb` → Créer
3. Dans le menu gauche : **Firestore Database** → **Créer une base de données**
   - Choisir **Mode production** → Région `europe-west` → Activer
4. Dans **Règles** de Firestore, coller ceci et publier :
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /planning/{document} {
         allow read, write: if true;
       }
     }
   }
   ```
5. Dans **Paramètres du projet** (icône ⚙️) → **Vos applications** → ajouter une **app Web** (`</>`)
   - Nom : `planning-rlb` → Enregistrer
   - **Copier les valeurs** affichées (apiKey, projectId, etc.)

---

### Étape 2 — Configurer le projet en local

```bash
# Installer les dépendances
npm install

# Copier le fichier de config
cp .env.example .env
```

Ouvrir `.env` et coller vos valeurs Firebase :
```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=planning-rlb.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=planning-rlb
VITE_FIREBASE_STORAGE_BUCKET=planning-rlb.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

Tester en local :
```bash
npm run dev
# → Ouvre http://localhost:5173
```

---

### Étape 3 — Déployer sur Vercel (2 min)

```bash
# Builder le projet
npm run build

# Déployer (installer Vercel CLI si nécessaire : npm i -g vercel)
npx vercel --prod
```

Pendant le déploiement, Vercel vous demande les variables d'environnement.
**Entrer chaque valeur du fichier `.env`** quand demandé.

→ Vous obtenez un lien comme : **`https://planning-rlb.vercel.app`**

---

### Étape 4 — Partager avec l'équipe

Envoyer le lien sur WhatsApp à Mickael, Zack, Enzo, Kurtis.

**Sur iPhone** : Safari → Partager → "Sur l'écran d'accueil" → icône comme une vraie app  
**Sur Android** : Chrome → ⋮ → "Ajouter à l'écran d'accueil"

---

## 🔄 Comment ça fonctionne

| Action | Ce qu'il se passe |
|--------|-------------------|
| Laetitia modifie un créneau | Tous les écrans ouverts se mettent à jour **en temps réel** |
| Laetitia publie le planning | Une notification 🔔 apparaît pour tous à la prochaine ouverture |
| Un employé ouvre l'app | Il voit toujours la dernière version, même hors ligne (cache) |

---

## 👥 Rôles

| Profil | Accès |
|--------|-------|
| **Laetitia** (RH) | Modifier, saisie groupée, compteur d'heures, renommer employés, publier |
| **Mickael / Zack / Enzo / Kurtis** | Consultation seule, vue "Mon planning" |

---

## 🛠️ Mise à jour du planning

Pour chaque nouveau mois : Laetitia se connecte, navigue au mois suivant avec `›`, 
remplit via **Saisie groupée** (⚡) puis clique **Publier**.

---

## 📁 Structure du projet

```
planning-rlb/
├── src/
│   ├── App.jsx        # Toute l'application
│   ├── firebase.js    # Connexion Firebase
│   └── main.jsx       # Point d'entrée React
├── index.html
├── package.json
├── vite.config.js
├── .env               # Vos clés Firebase (ne pas committer !)
└── .env.example       # Template
```

---

## 📧 Configuration des emails de notification

### 1. Créer un compte Resend (gratuit — 3 000 emails/mois)

1. Aller sur [https://resend.com](https://resend.com) → Sign up gratuit
2. **API Keys** → **Create API Key** → copier la clé
3. Ajouter dans `.env` : `RESEND_API_KEY=re_xxxxx`
4. Sur Vercel : **Settings → Environment Variables** → ajouter `RESEND_API_KEY`

### 2. Ajouter les emails des employés dans l'app

1. Connectez-vous en tant que **Laetitia**
2. Cliquer sur **👥** dans le header
3. Pour chaque employé : saisir son email dans le champ **📧 Email de notification**
4. Enregistrer

### 3. Ce qui se passe à la publication

Quand Laetitia clique **📢 Publier le planning**, chaque employé ayant un email configuré reçoit automatiquement un email avec :
- Son planning complet du mois (tableau jour par jour)
- Ses horaires matin + soir pour chaque jour travaillé
- Le total d'heures du mois

**Format de l'email de l'expéditeur :** Par défaut `onboarding@resend.dev` (domaine Resend).
Pour utiliser votre propre adresse (ex: `planning@residencebeleville.fr`), vérifiez votre domaine sur Resend et mettez à jour `EMAIL_FROM` dans les variables d'environnement Vercel.

