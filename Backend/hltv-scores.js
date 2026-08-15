/**
 * Score par map CS2 via hltv-next (paquet npm) :
 * https://www.npmjs.com/package/hltv-next
 *
 * Contrairement à hltv-match-api (le repo GitHub d'origine fourni) : celui-ci
 * a un build cassé (dossier gradle/ manquant dans le dépôt — impossible à
 * compiler tel quel, constaté en tentant de le déployer) et nécessite de
 * toute façon un service séparé à héberger (+ un navigateur headless en
 * compagnon). hltv-next est une bibliothèque Node qui tourne DANS ce
 * backend directement — aucune infrastructure de plus.
 *
 * IMPORTANT — import PROTÉGÉ : la 1ère tentative utilisait un `import ...
 * from "hltv-next"` statique en haut du fichier, qui a fait planter TOUT le
 * serveur au démarrage (Valorant y compris) quand le paquet n'était pas
 * disponible. Ici, le paquet est chargé dynamiquement (`await import(...)`)
 * SEULEMENT au moment où une map CS2 doit être résolue, et entouré d'un
 * try/catch : si ça échoue pour n'importe quelle raison (paquet absent,
 * erreur réseau, forme inattendue), la fonction renvoie simplement `null`
 * et cs2-routes.js retombe sur son repli PandaScore existant — le reste du
 * serveur (Valorant, tout le reste) n'est jamais concerné.
 *
 * Fonctionnement en 2 appels une fois le paquet chargé :
 *   1. HLTV.getResults({ startDate, endDate }) — fenêtre étroite (±1 jour
 *      autour de la date du match PandaScore) pour ne tirer qu'une seule
 *      page côté HLTV — puis on retrouve le bon match par similarité de nom
 *      d'équipe (comme vlr-scores.js pour Valorant).
 *   2. HLTV.getMatch({ id }) — détail complet du match trouvé, qui inclut
 *      directement le score par manche de chaque map jouée.
 *
 * ⚠️ HLTV protège son site par Cloudflare et peut bloquer une IP qui le
 * sollicite trop souvent. On reste strictement défensif : un seul essai par
 * match, résultat persisté dès qu'il est trouvé (cf cs2-history-store.js),
 * jamais de rafale de requêtes.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function similar(a, b) {
  const clean = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const ca = clean(a);
  const cb = clean(b);
  if (!ca || !cb) return false;
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Charge hltv-next à la demande, jamais au chargement du module. Mis en
// cache après le 1er succès (ou le 1er échec, pour ne pas retenter l'import
// à chaque appel si le paquet est vraiment absent). Ne lève JAMAIS — renvoie
// `null` en cas de souci, quelle qu'en soit la cause.
let hltvModulePromise = null;
async function loadHltv() {
  if (!hltvModulePromise) {
    hltvModulePromise = import("hltv-next")
      .then((mod) => mod.HLTV || mod.default || mod)
      .catch((e) => {
        console.log("[hltv-next] module indisponible (getMapScoresFromHltv restera désactivé) :", e.message);
        return null;
      });
  }
  return hltvModulePromise;
}

/**
 * Cherche le score par map d'un match CS2 sur HLTV, à partir des noms
 * d'équipe PandaScore + de la date du match (YYYY-MM-DD). Renvoie un
 * tableau [{map, score1, score2}, ...] — score1/score2 dans le MÊME ordre
 * que team1Name/team2Name passés en paramètre — ou `null` si non trouvé /
 * erreur / paquet indisponible. Jamais de score inventé, jamais de crash.
 */
async function getMapScoresFromHltv(team1Name, team2Name, dateStr) {
  if (!team1Name || !team2Name || !dateStr) return null;

  const HLTV = await loadHltv();
  if (!HLTV || typeof HLTV.getResults !== "function" || typeof HLTV.getMatch !== "function") {
    return null; // paquet absent ou forme inattendue -> repli PandaScore côté appelant
  }

  // Fenêtre étroite (±1 jour) autour de la date du match : getResults()
  // boucle tant qu'une page renvoie des résultats, donc sans borne de date
  // ça peut ratisser tout l'historique HLTV pour rien.
  const center = new Date(dateStr + "T00:00:00Z");
  const start = new Date(center.getTime() - 86400000);
  const end = new Date(center.getTime() + 86400000);

  let results;
  try {
    results = await HLTV.getResults({ startDate: isoDate(start), endDate: isoDate(end) });
  } catch (e) {
    console.log(`[hltv-next] getResults(${team1Name} vs ${team2Name}, ${dateStr}) → ERREUR:`, e.message);
    return null;
  }
  if (!Array.isArray(results) || results.length === 0) {
    console.log(`[hltv-next] getResults(${dateStr}) → 0 résultat HLTV sur la fenêtre`);
    return null;
  }

  const found = results.find(
    (r) =>
      (similar(r.team1 && r.team1.name, team1Name) && similar(r.team2 && r.team2.name, team2Name)) ||
      (similar(r.team1 && r.team1.name, team2Name) && similar(r.team2 && r.team2.name, team1Name))
  );
  if (!found) {
    console.log(
      `[hltv-next] aucune correspondance pour ${team1Name} vs ${team2Name} (${dateStr}) parmi ${results.length} résultats HLTV : ` +
        results.map((r) => (r.team1 && r.team1.name) + " vs " + (r.team2 && r.team2.name)).join(" | ")
    );
    return null;
  }

  await sleep(500); // petite pause avant le 2e appel, par courtoisie envers HLTV

  let full;
  try {
    full = await HLTV.getMatch({ id: found.id });
  } catch (e) {
    console.log(`[hltv-next] getMatch(${found.id}) → ERREUR:`, e.message);
    return null;
  }
  if (!full || !Array.isArray(full.maps) || full.maps.length === 0) {
    console.log(`[hltv-next] getMatch(${found.id}) → pas de maps exploitables`);
    return null;
  }

  const sameOrder = similar(found.team1 && found.team1.name, team1Name);
  const maps = full.maps
    .filter((m) => m && m.result)
    .map((m) => ({
      map: m.name || null,
      score1: sameOrder ? m.result.team1TotalRounds : m.result.team2TotalRounds,
      score2: sameOrder ? m.result.team2TotalRounds : m.result.team1TotalRounds,
    }));

  return maps.length > 0 ? maps : null;
}

export { getMapScoresFromHltv };
