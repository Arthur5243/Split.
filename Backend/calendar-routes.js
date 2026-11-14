/**
 * Routes HTTP pour les calendriers esports editables.
 *   GET  /api/calendar/:game            (public)
 *   POST /api/calendar/:game            (admin x-bracket-admin)
 */

import express from "express";
import { listCalendar, bulkReplaceCalendar, seedRL2026IfEmpty } from "./calendar-store.js";

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

const VALID = new Set(["valorant", "cs2", "rl"]);

router.get("/api/calendar/:game", (req, res) => {
  try {
    const g = String(req.params.game || "").toLowerCase();
    if (!VALID.has(g)) return res.status(400).json({ error: "game invalide (valorant/cs2/rl)" });
    // seed RL au premier appel si vide
    if (g === "rl") seedRL2026IfEmpty();
    res.json(listCalendar(g));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/calendar/:game", (req, res) => {
  if (!checkPwd(req, res)) return;
  try {
    const g = String(req.params.game || "").toLowerCase();
    if (!VALID.has(g)) return res.status(400).json({ error: "game invalide" });
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    bulkReplaceCalendar(g, events);
    res.json({ ok: true, game: g, count: events.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

export default router;
