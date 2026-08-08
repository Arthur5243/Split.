# SPLIT — déploiement sur Railway

Le projet est séparé en deux dossiers, à déployer comme deux services Railway distincts :

```
/frontend   -> l'app React/Vite (l'interface)
/backend    -> le proxy Express vers l'API PandaScore
```

## 1. Mettre le code sur GitHub

```bash
cd split-app         # le dossier qui contient frontend/ et backend/
git init
git add .
git commit -m "Migration Vercel -> Railway"
git branch -M main
git remote add origin https://github.com/TON-COMPTE/TON-REPO.git
git push -u origin main
```

## 2. Créer le service backend sur Railway

1. Sur [railway.app](https://railway.app), **New Project → Deploy from GitHub repo** → sélectionner le repo.
2. Dans les réglages du service, **Root Directory** → mettre `backend`.
3. Railway détecte automatiquement Node.js (grâce à `package.json`) et lance `npm start`.
4. Dans l'onglet **Variables**, ajouter :
   - `PANDASCORE_API_KEY` = ta clé secrète PandaScore
5. Une fois déployé, Railway te donne une URL publique du style `https://split-backend-production.up.railway.app`. Note-la.

## 3. Créer le service frontend sur Railway

1. Toujours dans le même projet Railway, **New Service → Deploy from GitHub repo** → même repo.
2. **Root Directory** → mettre `frontend`.
3. Dans **Variables**, ajouter :
   - `VITE_API_BASE` = l'URL du backend obtenue à l'étape 2 (sans slash à la fin)
4. Build command : `npm run build`
   Start command : `npm run preview -- --host 0.0.0.0 --port $PORT`
   (ou utiliser un service de type "static site" si Railway le propose, en pointant vers le dossier `dist`)

## Résumé des variables

| Service  | Variable            | Valeur                                   |
|----------|---------------------|-------------------------------------------|
| backend  | `PANDASCORE_API_KEY`| ta clé secrète PandaScore (jamais dans le code) |
| frontend | `VITE_API_BASE`     | URL publique du service backend Railway   |

La clé PandaScore ne se trouve jamais dans le code ni dans le repo GitHub : elle vit uniquement dans les variables d'environnement Railway du service backend.
