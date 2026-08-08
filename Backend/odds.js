
import express from "express";

const router = express.Router();

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_BASE = "https://api.odds-api.io/v3";

if (!ODDS_API_KEY) {
  console.warn(
    "⚠️  ODDS_API_KEY n'est pas définie. Ajoute-la dans les variables d'environnement de Railway."
  );
}

// Cache mémoire (5 min) pour rester dans le quota gratuit d'Odds-API.io (100 req/h)
let cache = { data: {}, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000;

// Un seul appel groupé pour TOUS les matchs esport en cours, au lieu d'un appel
// par match (ce qui faisait exploser le quota dans l'ancienne version).
async function fetchGroupedOdds() {
  const url = `${ODDS_BASE}/odds?sport=esports&bookmakers=Bet365,Unibet&apiKey=${ODDS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Odds-API HTTP " + res.status);
  return res.json();
}

// La doc publique d'Odds-API.io ne garantit pas 100% le nom exact des champs,
// donc on cherche le marché "vainqueur du match" (moneyline / h2h / ML) de façon
// défensive plutôt que de coder en dur un seul chemin qui pourrait ne pas matcher.
function findMoneylineOutcomes(event) {
  const fromBookmakers = Array.isArray(event.bookmakers)
    ? event.bookmakers.flatMap((b) => b.markets || [])
    : [];
  const marketsSources = [...fromBookmakers, ...(event.markets || [])];
  for (const mk of marketsSources) {
    const key = (mk.market || mk.key || mk.name || "").toString().toLowerCase();
    if (/moneyline|h2h|^ml$/.test(key)) {
      const outcomes = mk.outcomes || mk.selections || [];
      if (Array.isArray(outcomes) && outcomes.length === 2) return outcomes;
    }
  }
  return null;
}

// Convertit les 2 cotes décimales d'un match en 2 pourcentages qui totalisent
// TOUJOURS 100 (on retire la marge du bookmaker en normalisant les probabilités
// implicites entre elles, comme demandé).
function oddsToPercentPair(oddsA, oddsB) {
  const a = Number(oddsA);
  const b = Number(oddsB);
  if (!a || !b || a <= 1 || b <= 1) return [0, 0];
  const invA = 1 / a;
  const invB = 1 / b;
  const total = invA + invB;
  const pctA = Math.round((invA / total) * 100);
  return [pctA, 100 - pctA];
}

router.get("/api/odds", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cache.ts > CACHE_TTL) {
      const raw = await fetchGroupedOdds();
      const list = Array.isArray(raw) ? raw : raw.data || [];

      const byTeam = {};
      list.forEach((event) => {
        const home = event.home || (event.homeTeam && event.homeTeam.name);
        const away = event.away || (event.awayTeam && event.awayTeam.name);
        const outcomes = findMoneylineOutcomes(event);
        if (!home || !away || !outcomes) return;

        const priceOf = (teamName) => {
          const o = outcomes.find(
            (x) =>
              String(x.name || x.team || x.selection || "").toLowerCase() ===
              teamName.toLowerCase()
          );
          return o ? (o.price != null ? o.price : o.odds != null ? o.odds : o.decimal) : null;
        };

        const priceHome = priceOf(home);
        const priceAway = priceOf(away);
        if (priceHome == null || priceAway == null) return;

        const [pctHome, pctAway] = oddsToPercentPair(priceHome, priceAway);
        byTeam[home.toLowerCase()] = pctHome;
        byTeam[away.toLowerCase()] = pctAway;
      });

      cache = { data: byTeam, ts: now };
    }
    res.json(cache.data);
  } catch (e) {
    console.error("Odds error:", e.message);
    res.json({});
  }
});

export default router;
