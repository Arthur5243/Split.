/**
 * Score par map CS2 via l'API MediaWiki publique de Liquipedia (PAS la LPDB
 * payante/sur validation — celle-ci exclut explicitement les projets de
 * paris. L'API MediaWiki classique, elle, est gratuite et sans inscription :
 * https://liquipedia.net/api-terms-of-use).
 *
 * Contrairement à odds-api.io (couverture partielle, orientée gros matchs
 * avec marché de paris) : Liquipedia documente TOUS les matchs pro, y
 * compris les petits qualifs. Contrairement à hltv-match-api : pas de
 * scraping, pas de navigateur, pas de captcha — juste l'API wiki standard.
 *
 * PRINCIPE : les scores ne sont pas exposés en JSON propre par cette API
 * (ça, c'est justement ce que vend la LPDB payante) — ils sont dans le
 * wikitext brut de la page du tournoi, sous forme de templates
 * {{Match|opponent1=...|map1={{Map|t1t=X|t1ct=Y|t2t=Z|t2ct=W|...}}|...}}.
 * Score d'une équipe sur une map = somme de ses manches sur les 2 camps
 * (tXt + tXct), plus toutes les prolongations éventuelles (oNtXt + oNtXct,
 * N=1,2,3...). On récupère donc la page du tournoi puis on PARSE ce
 * wikitext nous-mêmes (fonctions extractTemplateBlocks/parseMatch),
 * validées à la main sur un vrai extrait de page avant intégration.
 *
 * QUOTAS (cf conditions d'utilisation officielles) :
 *   - 1 requête toutes les 2s maximum, tous types confondus
 *   - action=parse (celle qui récupère le contenu d'une page) : 1 toutes
 *     les 30s maximum, car plus coûteuse pour eux
 *   - User-Agent personnalisé obligatoire (les génériques type
 *     "node-fetch" sont bloqués) — cf LIQUIPEDIA_USER_AGENT ci-dessous,
 *     à ajuster avec un vrai contact si besoin.
 * Une page de tournoi contient souvent des dizaines de matchs (ex: IEM
 * Kraków 2026 en a plus de 50) : on met donc le wikitext de chaque page en
 * cache après le 1er fetch, pour ne jamais re-télécharger la même page pour
 * un autre match du même tournoi — sous la contrainte des 30s/action=parse,
 * c'est ce qui rend l'ensemble praticable.
 *
 * Défensif comme le reste de l'app : page introuvable, match introuvable
 * dans la page, champ manquant -> on renvoie `null`, jamais un score
 * inventé. L'appelant (cs2-routes.js) retombe alors sur ses autres replis.
 */

const LIQUIPEDIA_BASE = "https://liquipedia.net/counterstrike/api.php";
// Liquipedia bloque les User-Agent génériques ; celui-ci identifie le
// projet comme demandé par leurs conditions d'utilisation.
const LIQUIPEDIA_USER_AGENT = "SplitApp/1.0 (https://github.com/Arthur5243/Split.-main)";

const GENERAL_THROTTLE_MS = 2100; // un peu de marge sur le "1 req/2s" imposé
const PARSE_THROTTLE_MS = 31000; // idem sur le "1 action=parse/30s"

let lastGeneralCallAt = 0;
let lastParseCallAt = 0;

async function throttleGeneral() {
  const wait = lastGeneralCallAt + GENERAL_THROTTLE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeneralCallAt = Date.now();
}

async function throttleParse() {
  const wait = lastParseCallAt + PARSE_THROTTLE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastParseCallAt = Date.now();
  lastGeneralCallAt = Date.now();
}

async function liquipediaFetch(params, { isParse = false } = {}) {
  if (isParse) await throttleParse();
  else await throttleGeneral();
  const url = LIQUIPEDIA_BASE + "?" + new URLSearchParams({ ...params, format: "json" }).toString();
  const res = await fetch(url, { headers: { "User-Agent": LIQUIPEDIA_USER_AGENT } });
  if (!res.ok) throw new Error("liquipedia HTTP " + res.status);
  return res.json();
}

// --- Recherche de la page de tournoi -----------------------------------

// Renvoie plusieurs titres candidats (pas juste le 1er) : le 1er résultat
// est souvent une page d'index générique ("C-Tier Tournaments", "Qualifier
// Tournaments"...) plutôt que la vraie page du tournoi avec les matchs —
// surtout quand le nom de tournoi côté PandaScore est vague (ex: juste
// "2026"). L'appelant essaie chaque candidat jusqu'à en trouver un qui
// contient réellement des {{Match}} exploitables.
async function searchTournamentPages(query) {
  const json = await liquipediaFetch({ action: "query", list: "search", srsearch: query, srlimit: "5" });
  const results = json?.query?.search || [];
  return results.map((r) => r.title);
}

// --- Récupération + cache du wikitext d'une page ------------------------

const wikitextCache = new Map(); // page title -> { text, time }
const WIKITEXT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h : une page de tournoi ne change plus une fois les matchs finis

async function getWikitext(pageTitle) {
  const cached = wikitextCache.get(pageTitle);
  if (cached && Date.now() - cached.time < WIKITEXT_CACHE_TTL_MS) return cached.text;

  const json = await liquipediaFetch({ action: "parse", page: pageTitle, prop: "wikitext" }, { isParse: true });
  const text = json?.parse?.wikitext?.["*"];
  if (typeof text !== "string") return null;
  wikitextCache.set(pageTitle, { text, time: Date.now() });
  return text;
}

// --- Parseur de wikitext (validé sur un vrai extrait avant intégration) -

// Découpe le wikitext en blocs {{NomTemplate ... }} en comptant les
// accolades (les Match/Map s'imbriquent ; un regex non-greedy casserait sur
// le premier "}}" rencontré, qui appartient souvent à un sous-template).
function extractTemplateBlocks(text, templateName) {
  const blocks = [];
  const marker = "{{" + templateName;
  let i = 0;
  while (true) {
    const start = text.indexOf(marker, i);
    if (start === -1) break;
    const after = text[start + marker.length];
    if (after !== "|" && after !== "}" && after !== "\n") {
      i = start + marker.length;
      continue;
    }
    let depth = 0;
    let j = start;
    while (j < text.length) {
      if (text.startsWith("{{", j)) {
        depth++;
        j += 2;
      } else if (text.startsWith("}}", j)) {
        depth--;
        j += 2;
        if (depth === 0) break;
      } else {
        j++;
      }
    }
    blocks.push(text.slice(start, j));
    i = j;
  }
  return blocks;
}

// Lit un paramètre "|cle=valeur" au premier niveau d'un bloc de template
// (s'arrête au prochain "|nomparam=" ou à la fin du bloc, sans descendre
// dans les sous-templates {{...}} rencontrés en cours de route).
function getParam(block, key) {
  const re = new RegExp("\\|\\s*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=");
  const m = re.exec(block);
  if (!m) return null;
  let start = m.index + m[0].length;
  let depth = 0;
  let j = start;
  while (j < block.length) {
    if (block.startsWith("{{", j)) {
      depth++;
      j += 2;
      continue;
    }
    if (block.startsWith("}}", j)) {
      if (depth === 0) break;
      depth--;
      j += 2;
      continue;
    }
    if (block[j] === "|" && depth === 0) break;
    j++;
  }
  return block.slice(start, j).trim();
}

function getTeamOpponentSlug(block, key) {
  const raw = getParam(block, key);
  if (!raw) return null;
  const m = /\{\{TeamOpponent\|([^|}]+)/.exec(raw);
  return m ? m[1].trim() : null;
}

function sumRoundScore(mapBlock, side) {
  let total = 0;
  let found = false;
  for (const half of ["t", "ct"]) {
    const v = getParam(mapBlock, side + half);
    if (v != null && v !== "") {
      total += parseInt(v, 10) || 0;
      found = true;
    }
  }
  for (let n = 1; n <= 10; n++) {
    let hitAny = false;
    for (const half of ["t", "ct"]) {
      const v = getParam(mapBlock, "o" + n + side + half);
      if (v != null && v !== "") {
        total += parseInt(v, 10) || 0;
        found = true;
        hitAny = true;
      }
    }
    if (!hitAny) break;
  }
  return found ? total : null;
}

// "January 28, 2026 - 11:00 {{Abbr/CET}}" -> "2026-01-28" (on ignore heure/fuseau,
// une comparaison au jour près suffit pour désambiguïser les matchs).
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function parseLiquipediaDate(raw) {
  if (!raw) return null;
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/.exec(raw);
  if (!m) return null;
  const monthIdx = MONTHS.indexOf(m[1].toLowerCase());
  if (monthIdx === -1) return null;
  const mm = String(monthIdx + 1).padStart(2, "0");
  const dd = String(parseInt(m[2], 10)).padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

function parseMatchBlock(block) {
  const opponent1 = getTeamOpponentSlug(block, "opponent1");
  const opponent2 = getTeamOpponentSlug(block, "opponent2");
  if (!opponent1 || !opponent2) return null;
  const finished = getParam(block, "finished") === "true";
  const date = parseLiquipediaDate(getParam(block, "date"));

  const maps = [];
  for (let n = 1; n <= 9; n++) {
    const mapParam = getParam(block, "map" + n);
    if (!mapParam) break;
    const mapBlockMatch = /\{\{Map[\s\S]*\}\}/.exec(mapParam);
    if (!mapBlockMatch) continue;
    const mapBlock = mapBlockMatch[0];
    if (getParam(mapBlock, "finished") !== "true") continue; // "skip" = map non jouée
    const mapName = getParam(mapBlock, "map");
    const score1 = sumRoundScore(mapBlock, "t1");
    const score2 = sumRoundScore(mapBlock, "t2");
    if (score1 == null || score2 == null) continue;
    maps.push({ map: mapName, score1, score2 });
  }

  return { opponent1, opponent2, finished, date, maps };
}

// --- Résolution nom PandaScore <-> slug Liquipedia -----------------------

// Beaucoup de slugs Liquipedia sont des abréviations qui ne sont pas une
// simple sous-chaîne du nom complet (ex: "gl" pour GamerLegion, "navi" pour
// Natus Vincere, "tl" pour Team Liquid) : table à compléter au fil de
// l'eau, même principe que team-aliases.json pour vlr.gg/Valorant.
const SLUG_ALIASES = {
  navi: "natus vincere",
  gl: "gamerlegion",
  tl: "team liquid",
  vit: "vitality",
  faze: "faze clan",
  mongolz: "the mongolz",
  pain: "pain gaming",
  "bc.game": "bc.game esports",
  fut: "fut esports",
  nip: "ninjas in pyjamas",
  "passion ua": "passion ua",
  b8: "b8",
};

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

function slugMatchesName(slug, name) {
  if (!slug || !name) return false;
  if (similar(slug, name)) return true;
  const alias = SLUG_ALIASES[slug.toLowerCase()];
  return alias ? similar(alias, name) : false;
}

// --- Point d'entrée -------------------------------------------------------

// Cherche le match dans une page déjà récupérée ; renvoie les maps trouvées
// (dans l'ordre team1/team2) ou `null` si cette page ne contient pas ce
// match précis.
function findMatchInWikitext(wikitext, team1Name, team2Name, dateStr) {
  const blocks = extractTemplateBlocks(wikitext, "Match");
  const candidates = blocks.map(parseMatchBlock).filter(Boolean);
  if (candidates.length === 0) return { maps: null, matchCount: 0 };

  const sameOrderMatches = candidates.filter(
    (m) => m.finished && slugMatchesName(m.opponent1, team1Name) && slugMatchesName(m.opponent2, team2Name)
  );
  const swappedMatches = candidates.filter(
    (m) => m.finished && slugMatchesName(m.opponent1, team2Name) && slugMatchesName(m.opponent2, team1Name)
  );

  // Si l'une des 2 équipes se rencontre plusieurs fois dans le tournoi
  // (groupes + playoffs, etc.), on désambiguïse par date la plus proche.
  function pickClosestByDate(list) {
    if (list.length <= 1) return list[0] || null;
    if (!dateStr) return list[0];
    return list.reduce((best, cur) => {
      if (!cur.date) return best;
      if (!best || !best.date) return cur;
      return Math.abs(new Date(cur.date) - new Date(dateStr)) < Math.abs(new Date(best.date) - new Date(dateStr)) ? cur : best;
    }, null);
  }

  const found = pickClosestByDate(sameOrderMatches);
  if (found) return { maps: found.maps.length > 0 ? found.maps : null, matchCount: candidates.length };

  const foundSwapped = pickClosestByDate(swappedMatches);
  if (foundSwapped) {
    const maps =
      foundSwapped.maps.length > 0 ? foundSwapped.maps.map((m) => ({ map: m.map, score1: m.score2, score2: m.score1 })) : null;
    return { maps, matchCount: candidates.length };
  }

  return { maps: null, matchCount: candidates.length };
}

/**
 * Cherche le score par map d'un match CS2 sur Liquipedia, à partir des noms
 * d'équipe (côté PandaScore) et de la date (YYYY-MM-DD). Renvoie
 * [{map, score1, score2}, ...] (score1/score2 dans l'ordre team1Name/
 * team2Name), ou `null` si non trouvé/erreur. Jamais de score inventé.
 *
 * Cherche d'abord par ÉQUIPES + NOM DU TOURNOI (quand ce dernier est
 * exploitable, pas juste une année comme "2026") : utile quand les noms
 * d'équipe sont courts/génériques (ex: "BIG", "Spirit") et matchent
 * n'importe quoi en recherche plein texte seule (League of Legends, foot,
 * tennis de table...). Complète avec une recherche équipes seules. Essaie
 * ensuite chaque page candidate (searchTournamentPages) jusqu'à en trouver
 * une qui contient réellement le match — le 1er résultat de recherche est
 * souvent une page d'index générique sans données exploitables.
 */
async function getMapScoresFromLiquipedia(team1Name, team2Name, tournamentName, dateStr) {
  if (!team1Name || !team2Name) return null;

  const queries = [];
  if (tournamentName && !/^\d{4}$/.test(tournamentName.trim())) {
    queries.push(`${team1Name} ${team2Name} ${tournamentName}`);
  }
  queries.push(`${team1Name} ${team2Name}`);

  const seen = new Set();
  const pageTitles = [];
  for (const q of queries) {
    let results;
    try {
      results = await searchTournamentPages(q);
    } catch (e) {
      console.log(`[liquipedia] search(${q}) → ERREUR:`, e.message);
      continue;
    }
    for (const title of results || []) {
      if (!seen.has(title)) {
        seen.add(title);
        pageTitles.push(title);
      }
    }
  }
  if (pageTitles.length === 0) {
    console.log(`[liquipedia] search(${team1Name} ${team2Name}) → aucune page trouvée`);
    return null;
  }

  for (const pageTitle of pageTitles) {
    let wikitext;
    try {
      wikitext = await getWikitext(pageTitle);
    } catch (e) {
      console.log(`[liquipedia] wikitext(${pageTitle}) → ERREUR:`, e.message);
      continue;
    }
    if (!wikitext) continue;

    const { maps, matchCount } = findMatchInWikitext(wikitext, team1Name, team2Name, dateStr);
    if (maps) return maps;
    if (matchCount === 0) {
      console.log(`[liquipedia] "${pageTitle}" → page sans {{Match}} exploitable (probablement une page d'index), candidat suivant`);
      continue;
    }
    console.log(`[liquipedia] "${pageTitle}" → ${matchCount} matchs sur la page mais aucun ne correspond à ${team1Name} vs ${team2Name}`);
  }

  return null;
}

export { getMapScoresFromLiquipedia };
