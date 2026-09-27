/**
 * Backup automatique des SQLite DBs vers un dossier du repo GitHub.
 *
 * Utilise la Contents API GitHub (REST v3) pour PUT les fichiers directement,
 * pas besoin de simple-git ou cloner localement. Les .db sont gzippés avant
 * upload pour limiter la taille du repo (SQLite compresse ~60-70% en gzip).
 *
 * Env vars requises:
 *   GITHUB_BACKUP_TOKEN  → PAT avec scope 'repo' ou fine-grained 'contents:write'
 *   GITHUB_BACKUP_REPO   → optionnel, défaut "Arthur5243/Split."
 *   GITHUB_BACKUP_PATH   → optionnel, défaut "data-backup"
 *   GITHUB_BACKUP_BRANCH → optionnel, défaut "main"
 *   GITHUB_BACKUP_INTERVAL_HOURS → optionnel, défaut 24
 *
 * Sans GITHUB_BACKUP_TOKEN le worker est désactivé.
 *
 * Endpoint manuel: POST /api/admin/backup-now?key=<ADMIN_KEY>
 * Restore manuel: télécharger data-backup/*.db.gz depuis GitHub, gunzip,
 * puis POST /api/admin/upload-db?key=X&file=matches.db avec le body binaire.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";

const gzip = promisify(zlib.gzip);

const TOKEN = process.env.GITHUB_BACKUP_TOKEN || "";
const REPO = process.env.GITHUB_BACKUP_REPO || "Arthur5243/Split.";
const BASE_PATH = (process.env.GITHUB_BACKUP_PATH || "data-backup").replace(/^\/+|\/+$/g, "");
const BRANCH = process.env.GITHUB_BACKUP_BRANCH || "main";
const INTERVAL_H = Number(process.env.GITHUB_BACKUP_INTERVAL_HOURS || 24);

const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data";
const DB_FILES = ["matches.db", "cs2-matches.db"];

async function getExistingFileSha(pathInRepo) {
  const url = `https://api.github.com/repos/${REPO}/contents/${pathInRepo}?ref=${encodeURIComponent(BRANCH)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json" } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET SHA ${pathInRepo} HTTP ${r.status}`);
  const j = await r.json();
  return j.sha;
}

async function putFile(pathInRepo, contentBuffer, commitMessage) {
  const sha = await getExistingFileSha(pathInRepo).catch(() => null);
  const body = {
    message: commitMessage,
    branch: BRANCH,
    content: contentBuffer.toString("base64"),
  };
  if (sha) body.sha = sha;
  const url = `https://api.github.com/repos/${REPO}/contents/${pathInRepo}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`PUT ${pathInRepo} HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

export async function backupNow() {
  if (!TOKEN) {
    console.log("[github-backup] GITHUB_BACKUP_TOKEN non défini, skip");
    return { ok: false, reason: "no token" };
  }
  const results = [];
  for (const file of DB_FILES) {
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) {
      results.push({ file, ok: false, reason: "not found on disk" });
      continue;
    }
    try {
      const raw = fs.readFileSync(full);
      const gz = await gzip(raw);
      const targetPath = `${BASE_PATH}/${file}.gz`;
      const msg = `auto-backup: ${file} (${(gz.length / 1024).toFixed(1)} KB, source ${(raw.length / 1024).toFixed(1)} KB) — ${new Date().toISOString()}`;
      await putFile(targetPath, gz, msg);
      results.push({ file, ok: true, rawSize: raw.length, gzSize: gz.length, target: targetPath });
      console.log(`[github-backup] ${file} → ${targetPath} (${gz.length} bytes gzipped)`);
    } catch (e) {
      results.push({ file, ok: false, error: e.message });
      console.log(`[github-backup] ${file} erreur: ${e.message}`);
    }
  }
  return { ok: true, results, backedUpAt: new Date().toISOString() };
}

export function startBackupWorker() {
  if (!TOKEN) {
    console.log("ℹ️  GITHUB_BACKUP_TOKEN absent, worker github-backup désactivé");
    return;
  }
  console.log(`[github-backup] worker démarré: backup ${DB_FILES.join(", ")} vers ${REPO}/${BASE_PATH}/ toutes les ${INTERVAL_H}h (branch ${BRANCH})`);
  async function loop() {
    try { await backupNow(); } catch (e) { console.error("[github-backup] loop erreur:", e.message); }
    setTimeout(loop, INTERVAL_H * 60 * 60 * 1000);
  }
  // Premier backup 5 min après boot (le temps que le service se stabilise)
  setTimeout(loop, 5 * 60 * 1000);
}

export function mountBackupEndpoints(app) {
  const ADMIN_KEY = process.env.ADMIN_KEY;
  app.post("/api/admin/backup-now", async (req, res) => {
    if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) return res.status(403).json({ error: "forbidden" });
    try {
      const r = await backupNow();
      res.json(r);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
