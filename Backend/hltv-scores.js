/**
 * Score par map CS2 via hltv-next (paquet npm) :
 * https://www.npmjs.com/package/hltv-next
 *
 * Contrairement à la 1ère tentative (hltv-match-api, un service Spring Boot
 * à héberger à part avec un navigateur headless en compagnon) : ici c'est
 * une bibliothèque Node qui tourne DANS ce backend directement — aucune
 * infrastructure supplémentaire, aucun service Railway de plus, aucune clé
 * de captcha nécessaire.
 *
 * Fonctionnement en 2 appels :
 *   1. HLTV.getResults({ startDate, endDate }) — fenêtre étroite (±1 jour
 *      autour de la date du match PandaScore) pour ne tirer qu'une seule
 *      page côté HLTV — puis on retrouve le bon match par similarité de nom
 *      d'équipe (comme vlr-scores.js pour Valorant).
 *   2. HLTV.getMatch({ id }) — détail complet du match trouvé, qui inclut
 *      DIRECTEMENT le score par manche de chaque map jouée (team1TotalRounds
 *      / team2TotalRounds), en un seul appel. Pas besoin d'un pont vers un
 *      historique séparé : HLTV a déjà les matchs terminés, contrairement à
 *      hltv-match-api qui n'exposait que le direct/à venir.
 *
 * ⚠️ HLTV protège son site par Cloudflare et peut bloquer une IP qui le
 * sollicite trop souvent (avertissement officiel du paquet). Reste
 * strictement défensif comme le reste de l'app : un seul essai par match
 * (jamais de boucle agressive), résultat persisté dès qu'il est trouvé (cf
 * cs2-history-store.js, RETRY_DELAYS_MS gère les retentatives espacées en
 * cas d'échec), jamais de rafale de requêtes.
 */

// Interop CJS/ESM : selon la version, l'export par défaut est soit
// directement l'instance HLTV, soit un objet { HLTV }.
import pkg from "hltv-next";
const HLTV = pkg.HLTV || pkg.default || pkg;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Même comparateur que vlr-scores.js/cs2-scores.js (insensible à la casse/accents).
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

/**
 * Cherche le score par map d'un match CS2 sur HLTV, à partir des noms
 * d'équipe PandaScore + de la date du match (YYYY-MM-DD). Renvoie un
 * tableau [{map, score1, score2}, ...] — score1/score2 dans le MÊME ordre
 * que team1Name/team2Name passés en paramètre — ou `null` si non trouvé /
 * erreur / rien à afficher. Jamais de score inventé.
 */
async function getMapScoresFromHltv(team1Name, team2Name, dateStr) {
  if (!team1Name || !team2Name || !dateStr) return null;

  // Fenêtre étroite (±1 jour) autour de la date du match : getResults()
  // boucle tant qu'une page renvoie des résultats, donc sans borne de date
  // ça peut ratisser tout l'historique HLTV pour rien — ici une seule page
  // suffit largement.
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
