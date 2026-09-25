/**
 * Cito.gg scraper CS2 — récupère les scores map en direct.
 *
 * Cito.gg est une base de données esports gratuite qui indexe TOUS les matchs
 * CS2 (contrairement à bo3.gg qui rate les petits tournois). Pas de Cloudflare
 * hard, accessible depuis Railway.
 *
 * Workflow :
 * 1. Toutes les 60s, fetch https://cito.gg/matches/current?status=live
 * 2. Extrait la liste des matchs live avec leur URL /matches/cs2-match-<id>
 * 3. Pour chaque match, fetch la page détail et parse les map scores
 * 4. Cache en mémoire, matché par nom d'équipe
 */

const CITO_BASE = "https://cito.gg";
const LIST_URL = CITO_BASE + "/matches/current?status=live";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// Browserless (vrai Chromium headless sur Railway) → bypass Cloudflare.
// URL et TOKEN injectés par Railway via references ${{browserless.PORT}} et
// ${{browserless.TOKEN}}. Fallback fetch direct si absent (dev local).
const BROWSERLESS_URL = (process.env.BROWSERLESS_URL || "").replace(/\/$/, "");
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || "";

const POLL_INTERVAL_MS = 90_000; // 90s: browserless est plus lent qu'un fetch, on aère
const TTL_MS = 5 * 60 * 1000;
const MATCH_PAGE_CONCURRENCY = 2; // moins agressif pour ne pas surcharger browserless

const cache = new Map(); // key: normalized team1|team2 → { team1, team2, seriesScore, mapScores, scrapedAt, url }

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function fetchText(url) {
  // Priorité browserless (vrai navigateur, bypass Cloudflare) si dispo
  if (BROWSERLESS_URL && BROWSERLESS_TOKEN) {
    const endpoint = `${BROWSERLESS_URL}/content?token=${encodeURIComponent(BROWSERLESS_TOKEN)}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        gotoOptions: { waitUntil: "networkidle2", timeout: 30000 },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`browserless HTTP ${res.status} for ${url}: ${errText.slice(0, 200)}`);
    }
    return res.text();
  }
  // Fallback fetch direct (probablement 403 depuis Railway pour cito/HLTV)
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`cito HTTP ${res.status} for ${url}`);
  return res.text();
}

// Extraction des URLs /matches/cs2-match-<id> depuis la page listing.
// On récupère aussi les 2 noms d'équipe qui apparaissent juste à côté du lien
// pour un premier filtre rapide (évite d'aller charger 60+ pages détail pour
// des matchs qui ne nous intéressent pas).
function parseListPage(html) {
  const matches = [];
  const re = /href="(\/matches\/cs2-match-\d+)"[^>]*>([\s\S]{0,600}?)<\/a>/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(html))) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    // Cherche les noms d'équipes dans le bloc HTML (généralement <span> ou <div>
    // avec la classe qui contient "team" ou "name"). On extrait tous les
    // fragments texte pour matcher par la suite.
    const inner = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    matches.push({ url: CITO_BASE + url, hint: inner });
  }
  return matches;
}

// Liste des noms de map CS2 connus, pour repérer les blocs "score par map"
// dans le HTML nettoyé (on ne connait pas les classes CSS de cito.gg avec
// certitude, donc on parse par mots-clés).
const CS2_MAPS = [
  "Ancient", "Anubis", "Cache", "Dust2", "Dust 2", "Inferno", "Mirage",
  "Nuke", "Overpass", "Train", "Vertigo", "Cobblestone", "Season", "Tuscan",
  "Whistle",
];

// Extrait les scores map d'une page détail. cito.gg affiche typiquement :
//   Map 1 Ancient TEAM1 13:7 TEAM2
//   Map 2 Live Cache TEAM1 2:0 TEAM2 (in progress)
//   Map 3 Nuke TEAM1 -:- TEAM2 (not played)
// On matche par regex sur le texte nettoyé.
function parseMatchDetail(html, team1Name, team2Name) {
  // Texte "propre" : tags → espaces, entités décodées basiques, whitespace normalisé
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  const mapRe = new RegExp(
    "Map\\s*(\\d)[^A-Za-z0-9]*(Live\\s*)?(" + CS2_MAPS.join("|") + ")[\\s\\S]{0,80}?(\\d{1,2})\\s*[:\\-]\\s*(\\d{1,2})",
    "gi"
  );
  const found = [];
  let m;
  while ((m = mapRe.exec(text))) {
    const idx = parseInt(m[1], 10);
    const name = m[3].replace(/\s+/g, "");
    const s1 = parseInt(m[4], 10);
    const s2 = parseInt(m[5], 10);
    // "-:-" ne matche pas la regex (attend des chiffres), donc si on est ici
    // c'est qu'il y a au moins un score numérique.
    if (Number.isNaN(s1) || Number.isNaN(s2)) continue;
    found.push({ idx, map: name, score1: s1, score2: s2 });
  }
  // Tri par idx pour être sûr de l'ordre
  found.sort((a, b) => a.idx - b.idx);
  return found;
}

// Extrait les noms d'équipe depuis le titre <title>...</title> de la page
// détail (format typique : "TEAM1 vs TEAM2 - Cito").
function parseTeamsFromDetail(html) {
  const t = /<title>([^<]+)<\/title>/i.exec(html);
  if (!t) return { team1: null, team2: null };
  const m = /(.+?)\s+vs\.?\s+(.+?)\s*(?:-|\||•|·|$)/i.exec(t[1]);
  if (!m) return { team1: null, team2: null };
  return { team1: m[1].trim(), team2: m[2].trim() };
}

async function processMatch(url) {
  try {
    const html = await fetchText(url);
    const { team1, team2 } = parseTeamsFromDetail(html);
    if (!team1 || !team2) return;
    const maps = parseMatchDetail(html, team1, team2);
    if (maps.length === 0) return;

    // Score série = somme des maps où hi >= 13 avec 2 d'écart, ou plus
    // simplement où un côté a le score le plus haut avec des chiffres
    // ressemblant à un score CS2 fini
    let s1 = 0, s2 = 0;
    for (const g of maps) {
      const hi = Math.max(g.score1, g.score2);
      const lo = Math.min(g.score1, g.score2);
      if (hi >= 13 && hi - lo >= 2) {
        if (g.score1 > g.score2) s1++; else s2++;
      }
    }

    const key = normalize(team1) + "|" + normalize(team2);
    cache.set(key, {
      team1, team2, url, mapScores: maps, seriesScore: { a: s1, b: s2 }, scrapedAt: Date.now(),
    });
    console.log(
      `[cito-scraper] ${team1} vs ${team2} → ${s1}-${s2} |`,
      maps.map((g) => `${g.map}:${g.score1}-${g.score2}`).join(" ")
    );
  } catch (e) {
    console.log(`[cito-scraper] erreur ${url}: ${e.message}`);
  }
}

async function runOnce() {
  let listHtml;
  try {
    listHtml = await fetchText(LIST_URL);
  } catch (e) {
    console.log(`[cito-scraper] erreur liste: ${e.message}`);
    return;
  }
  const matches = parseListPage(listHtml);
  console.log(`[cito-scraper] ${matches.length} matchs live sur cito.gg`);

  // TTL cleanup
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.scrapedAt > TTL_MS) cache.delete(k);
  }

  // Concurrency limitée pour ne pas hammer cito.gg
  let i = 0;
  async function worker() {
    while (i < matches.length) {
      const idx = i++;
      await processMatch(matches[idx].url);
    }
  }
  await Promise.all(Array.from({ length: MATCH_PAGE_CONCURRENCY }, worker));
}

/**
 * Cherche un match par équipes dans le cache cito. Renvoie
 * `{ mapScores, seriesScore, title, url }` ou null. Matching partiel accepté
 * (les noms cito.gg peuvent différer légèrement de PandaScore).
 */
export function getCitoScoresForMatch(team1Name, team2Name) {
  const q1 = normalize(team1Name);
  const q2 = normalize(team2Name);
  for (const entry of cache.values()) {
    const t1 = normalize(entry.team1);
    const t2 = normalize(entry.team2);
    const match1 = t1 === q1 || t1.includes(q1) || q1.includes(t1);
    const match2 = t2 === q2 || t2.includes(q2) || q2.includes(t2);
    const swap1 = t1 === q2 || t1.includes(q2) || q2.includes(t1);
    const swap2 = t2 === q1 || t2.includes(q1) || q1.includes(t2);
    if ((match1 && match2) || (swap1 && swap2)) {
      const swap = swap1 && swap2;
      return {
        title: `${entry.team1} vs ${entry.team2}`,
        url: entry.url,
        seriesScore: swap
          ? { a: entry.seriesScore.b, b: entry.seriesScore.a }
          : entry.seriesScore,
        mapScores: entry.mapScores.map((g) =>
          swap ? { map: g.map, score1: g.score2, score2: g.score1 } : g
        ),
        scrapedAt: entry.scrapedAt,
      };
    }
  }
  return null;
}

export function startCitoScraper() {
  console.log("[cito-scraper] démarrage, poll toutes les 60s (liste + pages détail)");
  async function loop() {
    try { await runOnce(); } catch (e) { console.error("[cito-scraper] erreur:", e.message); }
    setTimeout(loop, POLL_INTERVAL_MS);
  }
  setTimeout(loop, 14_000);
}
