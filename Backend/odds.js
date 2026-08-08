// odds.js — à placer dans ton dossier Backend/ (à côté de server.js)
// Proxy vers Odds-API.io : renvoie un pourcentage de victoire par équipe.
// Nécessite : npm install odds-api-io cors
// Et la variable d'env ODDS_API_KEY (déjà ajoutée sur Railway).
const express = require("express");
const cors = require("cors");
const { OddsAPIClient } = require("odds-api-io");

const router = express.Router();
router.use(cors());

const client = new OddsAPIClient({ apiKey: process.env.ODDS_API_KEY });

// Cache mémoire (10 min) pour rester dans le quota du plan gratuit (100 req/h)
let cache = { data: {}, ts: 0 };
const CACHE_TTL = 10 * 60 * 1000;
const MAX_EVENTS = 30; // on limite le nombre d'events interrogés pour ne pas exploser le quota

function decimalToPercent(decimalOdds) {
  const n = Number(decimalOdds);
  if (!n || n <= 1) return null;
  return Math.round((1 / n) * 100);
}

// Le schema exact de la réponse getEventOdds n'est pas garanti à 100% (doc publique
// incomplète), donc on cherche un marché "moneyline / h2h / ML" de façon défensive
// plutôt que de coder en dur un seul chemin qui pourrait ne pas matcher.
function extractPercentages(oddsResponse) {
  const out = {};
  const bookmakers = (oddsResponse && (oddsResponse.bookmakers || oddsResponse.data)) || [];
  (Array.isArray(bookmakers) ? bookmakers : []).forEach((bm) => {
    const markets = bm.markets || bm.odds || [];
    (Array.isArray(markets) ? markets : []).forEach((mk) => {
      const key = (mk.market || mk.key || mk.name || "").toString().toLowerCase();
      if (!/moneyline|h2h|^ml$/.test(key)) return;
      const outcomes = mk.outcomes || mk.selections || [];
      (Array.isArray(outcomes) ? outcomes : []).forEach((o) => {
        const name = o.name || o.team || o.selection || o.participant;
        const price = o.price != null ? o.price : o.odds != null ? o.odds : o.decimal;
        const pct = decimalToPercent(price);
        if (name && pct != null) out[String(name).toLowerCase()] = pct;
      });
    });
  });
  return out;
}

router.get("/api/odds", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cache.ts > CACHE_TTL) {
      const events = await client.getEvents({ sport: "esports" });
      const list = Array.isArray(events) ? events.slice(0, MAX_EVENTS) : [];

      const byTeam = {};
      for (const ev of list) {
        try {
          const odds = await client.getEventOdds({ eventId: ev.id });
          Object.assign(byTeam, extractPercentages(odds));
        } catch {
          // pas de cotes dispo pour ce match -> on ignore et on continue
        }
      }
      cache = { data: byTeam, ts: now };
    }
    res.json(cache.data);
  } catch (e) {
    res.status(500).json({ error: "odds_unavailable" });
  }
});

module.exports = router;

