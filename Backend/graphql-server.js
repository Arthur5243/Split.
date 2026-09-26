/**
 * Endpoint GraphQL /graphql pour le backend Split.
 *
 * Expose les données CS2 live (via PandaScore + scrapers existants) au format
 * GraphQL query. Aucun bypass Cloudflare — utilise juste les données que le
 * backend a déjà en cache/mémoire.
 *
 * Utilisation :
 *   POST https://backend-svc-production-41e0.up.railway.app/graphql
 *   Body: {"query":"{ match(team1:\"M80\",team2:\"Liquid\"){ ... } }"}
 *
 * Explorateur visuel :
 *   GET https://backend-svc-production-41e0.up.railway.app/graphiql
 *   (interface web pour tester les queries sans curl)
 */

import { buildSchema } from "graphql";
import { createHandler } from "graphql-http/lib/use/express";
import { ruruHTML } from "ruru/server";

// --- Cache import du dernier /api/cs2-live pour éviter le double fetch ---
// On accède au cache déjà populé par cs2-routes.js via un import direct.
// Fallback : fetch interne au serveur lui-même (loop back).
let lastLiveData = null;
let lastLiveAt = 0;
const LIVE_TTL_MS = 30 * 1000;

async function getLiveMatches() {
  if (lastLiveData && Date.now() - lastLiveAt < LIVE_TTL_MS) return lastLiveData;
  const url = `http://localhost:${process.env.PORT || 3000}/api/cs2-live`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    lastLiveData = await r.json();
    lastLiveAt = Date.now();
    return lastLiveData;
  } catch (e) {
    console.log("[graphql] getLiveMatches erreur:", e.message);
    return lastLiveData || [];
  }
}

function normalize(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchTeams(match, team1Query, team2Query) {
  const t1 = match.opponents?.[0]?.opponent?.name || "";
  const t2 = match.opponents?.[1]?.opponent?.name || "";
  const n1 = normalize(t1);
  const n2 = normalize(t2);
  const q1 = normalize(team1Query);
  const q2 = normalize(team2Query);
  const forward = (n1.includes(q1) || q1.includes(n1)) && (n2.includes(q2) || q2.includes(n2));
  const reverse = (n1.includes(q2) || q2.includes(n1)) && (n2.includes(q1) || q1.includes(n2));
  return forward || reverse;
}

// --- Schéma GraphQL ---
const schema = buildSchema(`
  type Team {
    name: String
    acronym: String
    location: String
    imageUrl: String
  }

  type MapScore {
    map: String
    score1: Int
    score2: Int
  }

  type Cs2Match {
    id: Int
    name: String
    status: String
    tournament: String
    league: String
    beginAt: String
    numberOfGames: Int
    team1: Team
    team2: Team
    seriesScore: String
    liveMapScores: [MapScore]
    liveSource: String
    liveSourcesHit: [String]
    twitchTitle: String
    twitchChannel: String
  }

  type Query {
    """
    Cherche un match live par noms d'équipes (fuzzy, insensible casse).
    Ex: match(team1:"M80", team2:"Liquid")
    """
    match(team1: String!, team2: String!): Cs2Match

    """
    Retourne tous les matchs CS2 live actuellement.
    """
    liveMatches: [Cs2Match]

    """
    Retourne un match précis par son ID PandaScore.
    """
    matchById(id: Int!): Cs2Match
  }
`);

function toGraphQL(m) {
  if (!m) return null;
  const t1 = m.opponents?.[0]?.opponent;
  const t2 = m.opponents?.[1]?.opponent;
  const results = m.results || [];
  const series = results.length === 2 ? `${results[0].score}-${results[1].score}` : null;
  return {
    id: m.id,
    name: m.name,
    status: m.status,
    tournament: m.tournament?.name || m.serie?.full_name,
    league: m.league?.name,
    beginAt: m.begin_at,
    numberOfGames: m.number_of_games,
    team1: t1
      ? { name: t1.name, acronym: t1.acronym, location: t1.location, imageUrl: t1.image_url }
      : null,
    team2: t2
      ? { name: t2.name, acronym: t2.acronym, location: t2.location, imageUrl: t2.image_url }
      : null,
    seriesScore: series,
    liveMapScores: m.live_map_scores || [],
    liveSource: m.live_source || null,
    liveSourcesHit: m.live_sources_hit || [],
    twitchTitle: m.twitch_title || null,
    twitchChannel: m.twitch_channel || null,
  };
}

// --- Resolvers ---
const rootValue = {
  match: async ({ team1, team2 }) => {
    const matches = await getLiveMatches();
    const found = matches.find((m) => matchTeams(m, team1, team2));
    return toGraphQL(found);
  },
  liveMatches: async () => {
    const matches = await getLiveMatches();
    return matches.map(toGraphQL);
  },
  matchById: async ({ id }) => {
    const matches = await getLiveMatches();
    const found = matches.find((m) => m.id === id);
    return toGraphQL(found);
  },
};

/**
 * Mount les 2 endpoints /graphql (POST queries) et /graphiql (UI explorateur)
 * sur l'app Express passée en param.
 */
export function mountGraphQL(app) {
  // Endpoint POST pour les queries GraphQL
  app.all("/graphql", createHandler({ schema, rootValue }));

  // UI web pour tester les queries (comme graphql.org mais pointée sur ton serveur)
  app.get("/graphiql", (_req, res) => {
    res.type("html").end(ruruHTML({ endpoint: "/graphql" }));
  });

  console.log("[graphql] endpoints montés : POST /graphql + GET /graphiql (UI)");
}
