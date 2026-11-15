/**
 * Routes HTTP :
 *   PUBLIC  GET  /api/custom-matches/:game?status=upcoming|live|finished
 *   ADMIN   GET  /api/admin/custom-matches?game=X
 *   ADMIN   POST /api/admin/custom-matches             (upsert)
 *   ADMIN   POST /api/admin/custom-matches/bulk        (parse + bulk insert)
 *   ADMIN   DEL  /api/admin/custom-matches/:id
 *
 * Password admin via x-bracket-admin header ou ?key= (BRACKET_ADMIN_PASSWORD
 * ou fallback ADMIN_KEY).
 */

import express from "express";
import {
  listCustomMatches, upsertCustomMatch, deleteCustomMatch,
  parseBulkMatchesCode, getCustomMatch,
} from "./custom-matches-store.js";

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

const VALID_GAMES = new Set(["valorant", "cs2", "rl"]);

// ---------- Public ----------
router.get("/api/custom-matches/:game", (req, res) => {
  try {
    const game = String(req.params.game || "").toLowerCase();
    if (!VALID_GAMES.has(game)) return res.status(400).json({ error: "game invalide" });
    const status = req.query.status || null;
    res.json(listCustomMatches({ game, status: status || undefined }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Admin ----------
router.get("/api/admin/custom-matches", (req, res) => {
  try { res.json(listCustomMatches({ game: req.query.game || undefined, limit: Number(req.query.limit) || 500 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/api/admin/custom-matches/:id", (req, res) => {
  try { const m = getCustomMatch(req.params.id); if (!m) return res.status(404).json({ error: "not_found" }); res.json(m); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/admin/custom-matches", (req, res) => {
  if (!checkPwd(req, res)) return;
  try {
    const body = req.body || {};
    console.log(`[custom-matches] POST id=${body.id || "new"} game=${body.game} t1=${body.team1_name} t2=${body.team2_name}`);
    const r = upsertCustomMatch(body);
    res.json({ ok: true, id: r.id });
  } catch (e) {
    console.error("[custom-matches] POST error:", e.message);
    res.status(400).json({ error: e.message });
  }
});

router.post("/api/admin/custom-matches/bulk", (req, res) => {
  if (!checkPwd(req, res)) return;
  try {
    const { game, code } = req.body || {};
    if (!game || !code) return res.status(400).json({ error: "game et code requis" });
    const g = String(game).toLowerCase();
    if (!VALID_GAMES.has(g)) return res.status(400).json({ error: "game invalide" });
    const parsed = parseBulkMatchesCode(code, g);
    const inserted = [];
    for (const p of parsed) {
      try { const r = upsertCustomMatch(p); inserted.push(r.id); } catch {}
    }
    res.json({ ok: true, parsed: parsed.length, inserted: inserted.length, ids: inserted });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/api/admin/custom-matches/:id", (req, res) => {
  if (!checkPwd(req, res)) return;
  try { res.json({ ok: deleteCustomMatch(req.params.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
