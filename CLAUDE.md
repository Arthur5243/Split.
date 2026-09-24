# Split — CLAUDE.md

## Projet

App mobile-first PWA de pronostics esports (Valorant, CS2, Rocket League). Pas d'argent réel — points, classement, cosmétiques.

## Architecture

### Frontend (`Frontend/`)
- **Monolithique** : tout dans `App.jsx` (~11 000 lignes), Vite + Tailwind CSS
- `main.jsx` = point d'entrée, `admob.js` = intégration AdSense
- `cs2-manual-results.json` = scores maps CS2 manuels
- Images dans `public/` (logos, news, badges, banners)
- Dark mode uniquement, bilingue FR/EN (objet `STR` dans App.jsx)
- Navigation : 5 onglets bottom nav (Home, Valorant, CS2, RL, Classement)
- Classement = carousel 2 slides (Leaderboard + Communauté)
- Quand on est sur le slide Communauté, la bottom nav switch sur 3 items (Nexus, Discussion, Post)

### Backend (`Backend/`)
- Express.js (ESM), SQLite (better-sqlite3)
- `server.js` : routes Valorant, YouTube, historique matchs, VLR scores
- `cs2-routes.js` : routes CS2
- `rl-routes.js` : routes Rocket League
- `social-store.js` / `social-routes.js` : profils, follows, leaderboard, XP
- `auth-routes.js` : auth email/password + Google OAuth
- `posts-store.js` / `posts-routes.js` : feed communautaire
- `messages-store.js` / `messages-routes.js` : chat communautaire

### Déploiement
- **Railway auto-deploy** sur `git push origin main` (frontend + backend redémarrent)
- Frontend : service `frontend-svc` sur Railway
- Backend : service `backend-svc` sur Railway
- Env vars Railway : `PANDASCORE_API_KEY`, `YOUTUBE_API_KEY`, `GOOGLE_CLIENT_ID`, `JWT_SECRET`

## Sources de données

| Donnée | Valorant | CS2 | Rocket League |
|---|---|---|---|
| Matchs (upcoming/live/results) | PandaScore `/valorant/` | PandaScore `/csgo/` | PandaScore `/rl/` |
| Score par map/game | vlr.gg (scraping) | PandaScore + Liquipedia | `rl-manual-game-scores.json` + PandaScore |
| % de victoire (cotes) | Calcul Elo maison | Même système Elo | Même système Elo |
| Replays | YouTube API (chaînes VCT officielles par région) | YouTube API (filtre 40k+ abonnés) | YouTube API (filtre 40k+ abonnés) |

IDs de match : préfixe `ps-` (Valo), `cs2-` (CS2), `rl-` (RL) + id PandaScore.

## Système Elo (cotes)

Tout dans `App.jsx` côté frontend :
- `computeEloRatings()` — rating par équipe sur tout l'historique
- `h2hAdjustment()` — correctif confrontations directes (±7.5 pts max)
- `computeMatchOddsElo()` — combine Elo + H2H, renvoie `insufficientData: true` si < 3 matchs
- `attachComputedOdds()` — calcule Elo une seule fois par lot

Historique profond : `Backend/data/matches.json` (Valo), `Backend/data/matches-cs2.json` (CS2).

Poids par tier : Major = 1, IEM/BLAST Premier/EWC ≈ 0.85, ESL/PGL ≈ 0.75, défaut = 0.35.

## Système de points

- Score série exact : **3 pts**, bonne équipe : **1 pt**, bonus map exact : **2 pts**
- 5 pronostics actifs simultanés max (`DAILY_BET_LIMIT = 5`)
- Stockés dans `localStorage` (clé `predictions`)
- Verrouillés quand le match passe en running/finished

## Publicités

- AdSense publisher ID : `ca-pub-7218024010278471`
- Script chargé dans `index.html`, init dans `admob.js`
- Interstitiel skippable après 5s, auto-close à 15s
- Timer : 2-3 min aléatoire après login (`120000 + Math.random() * 60000` ms)
- `ads.txt` dans `public/` pour la vérification de domaine

## Règles de développement

### Git
- **Push automatiquement** après chaque commit, sans attendre
- Railway redéploie automatiquement sur push

### Contraintes techniques
- **Pas de Node.js** sur la machine de dev — scripts en PowerShell uniquement
- Tout le frontend est dans `App.jsx` — pas de fichiers composants séparés
- Backend : ESM (`import/export`), pas CommonJS

### Pièges à éviter
1. **Jamais d'`await` réseau par élément** dans un handler HTTP — Railway timeout. Répondre avec ce qu'on a, enrichir en tâche de fond.
2. **Env vars one-shot** (ex: `RESET_ABANDONED_MAP_SCORES`) — les retirer de Railway après usage, sinon re-exécutées à chaque push/redémarrage.
3. **Matchs sortis de la fenêtre API** mais toujours en base — les pipelines d'enrichissement doivent couvrir TOUS les matchs en base, pas seulement le batch API courant.
4. **HLTV.org bloque** toute requête automatisée depuis Railway (Cloudflare) — ne jamais proposer HLTV comme source automatisée.
5. **Liquipedia throttle strict** — ~2s entre recherches, ~31s entre pages. Cache wikitext en SQLite, jamais en mémoire (vidé au redémarrage).
6. **Noms d'équipes** doivent être cohérents avec PandaScore : "Falcons" pas "Team Falcons", "Liquid" pas "Team Liquid". `normTeamName()` ne fait que trim+lowercase.
7. **Scores map manuels** ne remplacent pas le score série — toujours vérifier cohérence avec `isMapScoresConsistent`.

### Style de code
- Réponses en français, direct et concis
- Pas de commentaires inutiles dans le code
- Pas de fichiers séparés pour les composants React — tout reste dans App.jsx
- Dark mode uniquement, couleur accent : `#CCF71D` (vert lime Split)

## Composants clés (tous dans App.jsx)

- `ClutchApp` : composant racine, gère état global, navigation, données
- `TopHeader` : logo Split (clic = refresh complet), langue, settings
- `MatchCard` : carte de match universelle (3 jeux), pronostic, replay, live, cotes
- `NewsCarousel` : 2 slides, crossfade, 6s auto-rotate
- `HomeTab`, `ValorantTab`, `Cs2Tab`, `RlTab` : onglets par jeu
- `ClassementTab` : leaderboard + communauté (carousel 2 slides)
- `ProfileSetupModal` : création/édition profil (pseudo obligatoire, reste optionnel)
- `GameScoreInput` : saisie score par map, auto-avancement
- `AdInterstitial` : interstitiel pub skippable
- `AuthScreen` : login email/Google

## APIs backend principales

- `GET /api/valorant-upcoming|live|results` — matchs Valorant
- `GET /api/cs2-upcoming|live|results` — matchs CS2
- `GET /api/rl-upcoming|live|results` — matchs RL
- `GET /api/match-history` / `cs2-match-history` / `rl-match-history` — historique profond
- `GET /api/social/leaderboard` — classement
- `POST /api/social/register` — créer/màj profil
- `POST /api/auth/login|register|google` — authentification
- `GET /api/youtube-replay|live` — replays/streams YouTube
- `POST /api/admin/cleanup-accounts` — nettoyage comptes inactifs (protégé par secret)
