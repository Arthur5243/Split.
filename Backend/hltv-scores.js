/**
 * Score par map CS2 via hltv-next (paquet npm) — DÉSACTIVÉ pour le moment.
 *
 * L'ajout de "hltv-next" à package.json a fait planter le démarrage du
 * serveur entier en production (donc Valorant avec, pas seulement CS2) :
 * très probablement un souci d'installation du paquet (npm install pas
 * rejoué, conflit de version, ou autre) qui a fait échouer l'import
 * `import pkg from "hltv-next"` tout en haut du fichier — en ESM, un import
 * qui échoue au chargement fait planter tout le process Node, pas juste la
 * route qui s'en sert.
 *
 * Correctif : ce fichier n'importe plus AUCUN paquet externe. La fonction
 * reste exportée (cs2-routes.js continue de l'appeler normalement) mais ne
 * fait plus rien de risqué — elle renvoie toujours `null`, ce qui fait
 * retomber cs2-routes.js sur son repli PandaScore existant. Zéro dépendance
 * nouvelle = zéro risque de reproduire le crash.
 *
 * À réactiver plus tard : réintroduire "hltv-next" dans package.json ET
 * confirmer que le déploiement a bien réinstallé les dépendances avant de
 * redonner du code à cette fonction (idéalement testé en dehors de la prod
 * d'abord, ou avec un import dynamique + try/catch pour qu'un échec
 * n'entraîne plus jamais tout le serveur avec lui).
 */

async function getMapScoresFromHltv(_team1Name, _team2Name, _dateStr) {
  return null;
}

export { getMapScoresFromHltv };
