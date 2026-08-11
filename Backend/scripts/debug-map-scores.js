// Backend/scripts/debug-map-scores.js
//
// Reproduit pas à pas le pipeline de vlr-scores.js pour UN match précis,
// avec tous les logs à chaque étape :
//   1) /v2/search?q=<team1>        -> trouve l'ID vlr.gg de team1
//   2) /v2/team?id=<id>&q=matches  -> liste ses matchs, trouve celui contre team2 à la date donnée
//   3) /v2/match/details?match_id= -> détail complet (toutes les maps)
//
// Usage :
//   node Backend/scripts/debug-map-scores.js "Dragon Ranger Gaming" "Xi Lai Gaming" 2026-06-09

const VLR_API_BASE = process.env.VLR_API_BASE || "https://vlrggapi-production-b3a0.up.railway.app";

const [team1Name, team2Name, dateStr] = process.argv.slice(2);
if (!team1Name || !team2Name || !dateStr) {
  console.error('Usage: node debug-map-scores.js "<team1>" "<team2>" <YYYY-MM-DD>');
  process.exit(1);
}

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function vlrFetch(path) {
  const url = VLR_API_BASE + path;
  console.log("→ GET", url);
  const res = await fetch(url);
  console.log("  status:", res.status);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function main() {
  console.log("\n=== ÉTAPE 1 : recherche de", team1Name, "===");
  const searchJson = await vlrFetch("/v2/search?q=" + encodeURIComponent(team1Name));
  const teams = searchJson?.data?.segments?.results?.teams || [];
  console.log(
    "Équipes trouvées:",
    teams.map((t) => `${t.name} (#${t.id})`)
  );
  const target = normalize(team1Name);
  const match = teams.find((t) => normalize(t.name) === target) || teams[0];
  if (!match) {
    console.error("❌ Aucune équipe trouvée pour", team1Name);
    return;
  }
  console.log("✅ Équipe retenue:", match.name, "— id:", match.id);

  console.log("\n=== ÉTAPE 2 : matchs de", match.name, "===");
  const teamJson = await vlrFetch(`/v2/team?id=${match.id}&q=matches&page=1`);
  const matches = teamJson?.data?.matches || [];
  console.log(`${matches.length} match(s) renvoyés par l'API`);

  const targetOpp = normalize(team2Name);
  const targetDate = new Date(dateStr + "T00:00:00");
  let best = null;
  for (const m of matches) {
    const t1 = normalize(m.teams?.team1);
    const t2 = normalize(m.teams?.team2);
    if (![t1, t2].includes(targetOpp)) continue;
    const mDate = m.date ? new Date(m.date) : null;
    if (!mDate) continue;
    const diffDays = Math.abs((mDate - targetDate) / 86400000);
    console.log(
      `  candidat: ${m.teams?.team1} vs ${m.teams?.team2} — ${m.date} — match_id ${m.match_id} — écart ${diffDays.toFixed(1)}j`
    );
    if (diffDays <= 1) {
      best = m;
      break;
    }
  }
  if (!best) {
    console.error("❌ Aucun match contre", team2Name, "trouvé autour du", dateStr);
    console.log("   (vérifie que le nom d'adversaire matche EXACTEMENT ce que renvoie l'API ci-dessus)");
    return;
  }
  console.log("✅ Match retenu — match_id:", best.match_id);

  console.log("\n=== ÉTAPE 3 : détail du match", best.match_id, "===");
  const detailsJson = await vlrFetch(`/v2/match/details?match_id=${best.match_id}`);
  const maps = detailsJson?.data?.maps || [];
  console.log(`${maps.length} map(s) dans la réponse brute :`);
  console.log(JSON.stringify(maps, null, 2));

  console.log("\n=== RÉSULTAT APRÈS LE FILTRE ACTUEL DE vlr-scores.js ===");
  const parsed = maps
    .filter((m) => m.score && m.score.team1 && m.score.team2)
    .map((m) => ({ map: m.map_name, score1: m.score.team1.total, score2: m.score.team2.total }));

  if (parsed.length === maps.length) {
    console.log("✅ Toutes les maps passent le filtre:", parsed);
  } else {
    console.log(`⚠️ ${maps.length - parsed.length} map(s) éliminée(s) par le filtre. Résultat gardé:`, parsed);
    console.log("   → regarde la forme exacte de \"score\" dans le JSON brut ci-dessus pour les maps manquantes");
    console.log("   (peut-être un champ différent de score.team1.total / score.team2.total)");
  }
}

main().catch((e) => console.error("💥 Erreur:", e));
