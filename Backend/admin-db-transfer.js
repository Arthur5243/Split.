/**
 * Endpoints admin pour transférer les fichiers .db entre 2 backends Split.
 * Usage : migration entre 2 comptes Railway avec 2 volumes différents.
 *
 * GET  /api/admin/download-db?key=<ADMIN_KEY>&file=matches.db  → stream le fichier
 * POST /api/admin/upload-db?key=<ADMIN_KEY>&file=matches.db    → écrit le body
 * GET  /api/admin/list-db?key=<ADMIN_KEY>                       → liste /data/
 *
 * Après un upload, il faut redeploy le service pour que better-sqlite3
 * recharge les DB depuis le fichier écrit (les connexions sont ouvertes au boot).
 */

import fs from "node:fs";
import path from "node:path";
import express from "express";

const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data";
const ALLOWED_FILES = ["matches.db", "cs2-matches.db", "matches.db-wal", "matches.db-shm", "cs2-matches.db-wal", "cs2-matches.db-shm"];

function checkAuth(req, res) {
  const ADMIN_KEY = process.env.ADMIN_KEY;
  if (!ADMIN_KEY) {
    res.status(500).json({ error: "ADMIN_KEY not configured on this backend" });
    return false;
  }
  if (req.query.key !== ADMIN_KEY) {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

export function mountAdminDbTransfer(app) {
  // Liste des fichiers présents dans /data (pour vérifier avant download)
  app.get("/api/admin/list-db", (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
      const files = fs.readdirSync(DATA_DIR).map((name) => {
        const full = path.join(DATA_DIR, name);
        const stat = fs.statSync(full);
        return { name, size: stat.size, mtime: stat.mtime.toISOString() };
      });
      res.json({ dataDir: DATA_DIR, files });
    } catch (e) {
      res.status(500).json({ error: e.message, dataDir: DATA_DIR });
    }
  });

  // Download d'un fichier .db en octets
  app.get("/api/admin/download-db", (req, res) => {
    if (!checkAuth(req, res)) return;
    const file = req.query.file;
    if (!ALLOWED_FILES.includes(file)) {
      return res.status(400).json({ error: "invalid file", allowed: ALLOWED_FILES });
    }
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) {
      return res.status(404).json({ error: "file not found on this backend", path: full });
    }
    const stat = fs.statSync(full);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
    fs.createReadStream(full).pipe(res);
  });

  // Upload : reçoit le fichier binaire dans le body et l'écrit dans /data/
  // Nécessite un redeploy après pour que les connexions SQLite rechargent.
  app.post("/api/admin/upload-db",
    express.raw({ limit: "500mb", type: () => true }),
    (req, res) => {
      if (!checkAuth(req, res)) return;
      const file = req.query.file;
      if (!ALLOWED_FILES.includes(file)) {
        return res.status(400).json({ error: "invalid file", allowed: ALLOWED_FILES });
      }
      if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: "empty body — envoie le fichier en application/octet-stream" });
      }
      const full = path.join(DATA_DIR, file);
      try {
        // Backup l'ancien si présent
        if (fs.existsSync(full)) {
          fs.copyFileSync(full, full + ".bak-" + Date.now());
        }
        fs.writeFileSync(full, req.body);
        const stat = fs.statSync(full);
        res.json({
          ok: true,
          file,
          path: full,
          size: stat.size,
          warn: "Redeploy le service pour que better-sqlite3 recharge les DB depuis le nouveau fichier.",
        });
      } catch (e) {
        res.status(500).json({ error: e.message, path: full });
      }
    }
  );

  console.log("[admin-db-transfer] endpoints /api/admin/{list,download,upload}-db montés (DATA_DIR=" + DATA_DIR + ")");
}
