import express from "express";

const router = express.Router();

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_BASE = "https://api.odds-api.io/v3";

if (!ODDS_API_KEY) {
  console.warn(
    "⚠️  ODDS_API_KEY n'est pas définie. Ajoute-la dans les variables d'environnement de Railway."
  );
}

// Cache mémoire pour rester dans le quota gratuit d'Odds-API.io (100 req/h).
// On limite aussi le nombre d'events interrogés par cycle (voir MAX_EVENTS).
let cache = { data: {}, ts: 0 };
const CACHE_TTL = 15 * 60 * 1000; // 15 min
const MAX_EVENTS = 15; // events x 15min => reste large sous 100 req/h

// Étape 1 : liste des events esports à venir (n'importe quel titre, on filtre ensuite).
async function fetchEsportsEvents() {
  const url = `${ODDS_BASE}/events?sport=esports&apiKey=${ODDS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Odds-API /events HTTP " + res.status);
  const json = await res.json();
  return Array.isArray(json) ? json : json.data || json.events || [];
}

// Le champ qui identifie le jeu peut s'appeler league/title/game selon les events :
// on reste défensif et on cherche "valorant" partout où c'est plausible.
function isValorantEvent(ev) {
  const haystack = [ev.league, ev.title, ev.game, ev.sport_title, ev.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes("valorant");
}

// Étape 2 : cotes d'un event précis (nécessite eventId, cf doc Odds-API.io).
async function fetchEventOdds(eventId) {
  const url = `${ODDS_BASE}/odds?eventId=${eventId}&bookmakers=Bet365,Unibet&apiKey=${ODDS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// home/away -> 2 pourcentages qui totalisent toujours 100 (marge du bookmaker retirée).
function oddsToPercentPair(oddsHome, oddsAway) {
  const a = Number(oddsHome);
  const b = Number(oddsAway);
  if (!a || !b || a <= 1 || b <= 1) return null;
  const invA = 1 / a;
  const invB = 1 / b;
  const total = invA + invB;
  const pctHome = Math.round((invA / total) * 100);
  return [pctHome, 100 - pctHome];
}

// Prend la 1ère cote "ML" (moneyline / vainqueur du match) dispo, tous bookmakers confondus.
function extractMoneyline(oddsPayload) {
  const bookmakers = oddsPayload.bookmakers || {};
  for (const name of Object.keys(bookmakers)) {
    const markets = bookmakers[name] || [];
    const ml = markets.find((mk) => (mk.name || "").toUpperCase() === "ML");
    if (ml && Array.isArray(ml.odds) && ml.odds[0]) {
      return ml.odds[0]; // { home, draw?, away }
    }
  }
  return null;
}

router.get("/api/odds", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cache.ts > CACHE_TTL) {
      const events = await fetchEsportsEvents();
      const valorantEvents = events.filter(isValorantEvent).slice(0, MAX_EVENTS);

      const byTeam = {};
      for (const ev of valorantEvents) {
        const oddsPayload = await fetchEventOdds(ev.id);
        if (!oddsPayload) continue;

        const ml = extractMoneyline(oddsPayload);
        const home = oddsPayload.home || ev.home;
        const away = oddsPayload.away || ev.away;
        if (!ml || !home || !away) continue;

        const pair = oddsToPercentPair(ml.home, ml.away);
        if (!pair) continue;

        byTeam[home.toLowerCase()] = pair[0];
        byTeam[away.toLowerCase()] = pair[1];
      }

      cache = { data: byTeam, ts: now };
    }
    res.json(cache.data);
  } catch (e) {
    console.error("Odds error:", e.message);
    res.json({});
  }
});

export default router;
