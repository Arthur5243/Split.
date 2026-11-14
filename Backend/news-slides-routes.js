/**
 * Routes HTTP pour les slides News editables depuis /password.
 *
 *   GET  /api/news-slides            -> liste publique
 *   POST /api/news-slides            -> bulk replace (admin)
 *
 * Password admin : header x-bracket-admin ou ?key= (meme logique que
 * custom-brackets-routes).
 */

import express from "express";
import { listNewsSlides, bulkReplaceNewsSlides } from "./news-slides-store.js";

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

router.get("/api/news-slides", (req, res) => {
  try { res.json(listNewsSlides()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/news-slides", (req, res) => {
  if (!checkPwd(req, res)) return;
  try {
    const slides = Array.isArray(req.body?.slides) ? req.body.slides : [];
    bulkReplaceNewsSlides(slides);
    res.json({ ok: true, count: slides.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

export default router;
