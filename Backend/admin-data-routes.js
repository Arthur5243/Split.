/**
 * Routes admin (password protege) pour /password :
 *   - GET/POST/DELETE /api/admin/teams          : alias equipes
 *   - GET/POST/DELETE /api/admin/manual-scores  : scores map manuels
 *   - GET  /api/admin/missing-scores            : liste matchs sans map_scores
 */

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveTeam, upsertTeam, listTeams, deleteTeam, removeAlias, seedKnownAliasesIfEmpty,
} from "./team-aliases-store.js";
import {
  getManualMapScores, setManualMapScores, deleteManualMapScores,
  listManualMapScores, findMatchesMissingScores,
} from "./manual-map-scores-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_DB = process.env.DB_PATH || path.join(__dirname, "matches.db");
const CS2_DB = process.env.CS2_DB_PATH || path.join(__dirname, "cs2-matches.db");

const router = express.Router();

function adminPassword() {
  return process.env.BRACKET_ADMIN_PASSWORD || process.env.ADMIN_KEY || null;
}
function checkPwd(req, res) {
  const pwd = adminPassword();
  if (!pwd) { res.status(500).json({ error: "BRACKET_ADMIN_PASSWORD non configure" }); return false; }
  const provided = req.headers["x-bracket-admin"] || req.query.key || req.body?.password;
  if (provided !== pwd) { res.status(403).json({ error: "forbidden" }); return false; }
  return true;
}

// --- Teams / aliases -------------------------------------------------------
router.get("/api/admin/teams", (req, res) => {
  try {
    seedKnownAliasesIfEmpty();
    res.json(listTeams({ game: req.query.game || undefined, q: req.query.q || undefined, limit: Math.min(200, Number(req.query.limit) || 50) }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/api/admin/teams/resolve", (req, res) => {
  try {
    const name = req.query.name || "";
    res.json(resolveTeam(name) || { resolved: false, name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Endpoint public leger : resolve logo depuis nom d'equipe.
router.get("/api/team-logo-resolve", (req, res) => {
  try {
    const t = resolveTeam(req.query.name || "");
    res.json({
      resolved: !!t,
      canonical: t?.canonical || null,
      logo_url: t?.logo_url || null,
      liquipedia: t?.liquipedia || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/admin/teams", (req, res) => {
  if (!checkPwd(req, res)) return;
  try {
    const { canonical, game, logo_url, liquipedia, country, aliases } = req.body || {};
    const r = upsertTeam({ canonical, game, logo_url, liquipedia, country, aliases: Array.isArray(aliases) ? aliases : [], added_by: "admin" });
    res.json({ ok: true, id: r.id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/api/admin/teams/:id", (req, res) => {
  if (!checkPwd(req, res)) return;
  try { res.json({ ok: deleteTeam(req.params.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/admin/teams/:id/alias/:alias", (req, res) => {
  if (!checkPwd(req, res)) return;
  try { res.json({ ok: removeAlias(decodeURIComponent(req.params.alias), req.params.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Manual map scores -----------------------------------------------------
router.get("/api/admin/manual-scores", (req, res) => {
  try { res.json(listManualMapScores({ game: req.query.game || undefined, limit: Math.min(500, Number(req.query.limit) || 100) })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/api/admin/manual-scores/:matchId", (req, res) => {
  try {
    const scores = getManualMapScores(req.params.matchId);
    res.json({ match_id: req.params.matchId, scores });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/admin/manual-scores", (req, res) => {
  if (!checkPwd(req, res)) return;
  try {
    const { match_id, game, team1_name, team2_name, day, scores } = req.body || {};
    if (!match_id) return res.status(400).json({ error: "match_id requis" });
    if (!Array.isArray(scores) || scores.length === 0) return res.status(400).json({ error: "scores requis (array non vide)" });
    setManualMapScores({ match_id, game, team1_name, team2_name, day, scores });
    res.json({ ok: true, match_id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/api/admin/manual-scores/:matchId", (req, res) => {
  if (!checkPwd(req, res)) return;
  try { res.json({ ok: deleteManualMapScores(req.params.matchId) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Matchs sans map_scores (pour UI "a completer") ------------------------
router.get("/api/admin/missing-scores", (req, res) => {
  try {
    const game = String(req.query.game || "valorant").toLowerCase();
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const dbPath = game === "cs2" ? CS2_DB : MAIN_DB;
    const rows = findMatchesMissingScores({ dbPath, limit });
    res.json({ game, count: rows.length, matches: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
