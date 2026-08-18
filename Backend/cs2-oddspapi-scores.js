/**
 * Intégration OddsPapi pour CS2 — pourcentages de victoire (%) basés sur
 * les cotes de bookmaker, contrairement au système "maison" (historique de
 * victoires) utilisé côté Valorant. Décision explicite du projet : donner
 * un résultat plus "pro" côté CS2 (les bookmakers, c'est leur métier),
 * quitte à ce que les deux jeux n'aient pas la même logique de calcul.
 *
 * === FICHIER TEMPORAIRE DE DIAGNOSTIC ===
 * Avant d'écrire le vrai code de correspondance PandaScore <-> OddsPapi, on
 * a besoin de voir la vraie forme des réponses /tournaments et /fixtures
 * pour CS2 (sportId=17) — la doc publique ne donne d'exemple concret que
 * pour le foot. Ce module expose juste une fonction de diagnostic brute
 * pour l'instant.
 */

const ODDSPAPI_BASE = "https://api.oddspapi.io/v4";
const ODDSPAPI_API_KEY = process.env.ODDSPAPI_API_KEY;
const CS2_SPORT_ID = 17;

async function oddspapiFetch(path, params = {}) {
  if (!ODDSPAPI_API_KEY) {
    throw new Error("ODDSPAPI_API_KEY n'est pas définie dans les variables d'environnement Railway.");
  }
  const qs = new URLSearchParams({ ...params, apiKey: ODDSPAPI_API_KEY }).toString();
  const url = `${ODDSPAPI_BASE}${path}?${qs}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OddsPapi ${path} → HTTP ${res.status}`);
  }
  return res.json();
}

// Diagnostic : renvoie un échantillon brut des tournois CS2 + des matchs à
// venir des 3 prochains jours, pour inspecter les vrais noms de champs
// avant d'écrire la logique de correspondance avec PandaScore.
async function diagnosticSample() {
  const tournaments = await oddspapiFetch("/tournaments", { sportId: CS2_SPORT_ID });

  const today = new Date();
  const in3days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const fixtures = await oddspapiFetch("/fixtures", {
    sportId: CS2_SPORT_ID,
    from: fmt(today),
    to: fmt(in3days),
  });

  return {
    nb_tournois: Array.isArray(tournaments) ? tournaments.length : "format inattendu",
    echantillon_tournois: Array.isArray(tournaments) ? tournaments.slice(0, 3) : tournaments,
    nb_matchs: Array.isArray(fixtures) ? fixtures.length : "format inattendu",
    echantillon_matchs: Array.isArray(fixtures) ? fixtures.slice(0, 3) : fixtures,
  };
}

export { diagnosticSample };
