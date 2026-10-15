/**
 * Backup des DONNÉES UTILISATEURS (hors email/mdp — gérés par Supabase) vers
 * un repo GitHub. Guard par :
 *   - GITHUB_BACKUP_TOKEN  (PAT scope `repo` ou `contents:write`)
 *   - GITHUB_BACKUP_REPO   (défaut : "Arthur5243/Split.")
 *   - GITHUB_BACKUP_PATH   (défaut : "data-backup")
 *   - GITHUB_BACKUP_BRANCH (défaut : "main")
 *   - GITHUB_USERS_BACKUP_INTERVAL_HOURS (défaut : 6h)
 *
 * Exclus volontairement : `email`, `password_hash`, `reset_token`, `reset_token_expires`,
 * `supabase_id` → les comptes sont auth via Supabase, pas d'intérêt à les
 * dupliquer en clair sur GitHub public.
 *
 * Endpoints :
 *   POST /api/admin/users-backup-now?key=<ADMIN_KEY> → force un push immédiat
 *
 * Les tables sauvegardées : users, user_sync (predictions), user_match_points,
 * follows, posts, post_likes, post_comments, community_messages.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import Database from "better-sqlite3";

const gzip = promisify(zlib.gzip);
const TOKEN = process.env.GITHUB_BACKUP_TOKEN || "";
const REPO = process.env.GITHUB_BACKUP_REPO || "Arthur5243/Split.";
const BASE_PATH = (process.env.GITHUB_BACKUP_PATH || "data-backup").replace(/^\/+|\/+$/g, "");
const BRANCH = process.env.GITHUB_BACKUP_BRANCH || "main";
const INTERVAL_H = Number(process.env.GITHUB_USERS_BACKUP_INTERVAL_HOURS || 6);
const DB_PATH = process.env.DB_PATH || "/data/matches.db";

// Colonnes exclues : gérées ailleurs (Supabase) OU trop sensibles pour un repo.
const USER_EXCLUDED = new Set(["email", "password_hash", "reset_token", "reset_token_expires", "supabase_id"]);

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
  const body = { message: commitMessage, branch: BRANCH, content: contentBuffer.toString("base64") };
  if (sha) body.sha = sha;
  const url = `https://api.github.com/repos/${REPO}/contents/${pathInRepo}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`PUT ${pathInRepo} HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

function sanitizeUser(row) {
  const out = {};
  for (const k of Object.keys(row)) {
    if (!USER_EXCLUDED.has(k)) out[k] = row[k];
  }
  return out;
}

export async function usersBackupNow() {
  if (!TOKEN) return { ok: false, reason: "no token" };
  if (!fs.existsSync(DB_PATH)) return { ok: false, reason: "db not found" };
  const db = new Database(DB_PATH, { readonly: true });
  const dump = { backedUpAt: new Date().toISOString(), db: path.basename(DB_PATH), note: "emails et password_hash exclus (gérés par Supabase)" };
  const safeAll = (sql) => { try { return db.prepare(sql).all(); } catch { return []; } };
  dump.users = safeAll("SELECT * FROM users").map(sanitizeUser);
  dump.user_sync = safeAll("SELECT * FROM user_sync");
  dump.user_match_points = safeAll("SELECT * FROM user_match_points");
  dump.follows = safeAll("SELECT * FROM follows");
  dump.posts = safeAll("SELECT * FROM posts");
  dump.post_likes = safeAll("SELECT * FROM post_likes");
  dump.post_comments = safeAll("SELECT * FROM post_comments");
  dump.community_messages = safeAll("SELECT * FROM community_messages");
  dump.oracle_uses = safeAll("SELECT * FROM oracle_uses");
  db.close();
  const json = Buffer.from(JSON.stringify(dump, null, 2), "utf8");
  const gz = await gzip(json);
  const target = `${BASE_PATH}/users.json.gz`;
  const msg = `users-backup: ${dump.users.length} users, ${(json.length / 1024).toFixed(1)} KB (gz ${(gz.length / 1024).toFixed(1)} KB) — ${dump.backedUpAt}`;
  await putFile(target, gz, msg);
  return { ok: true, users: dump.users.length, size: json.length, gzSize: gz.length, target };
}

export function startUsersBackupWorker() {
  if (!TOKEN) {
    console.log("ℹ️  GITHUB_BACKUP_TOKEN absent, worker users-backup désactivé");
    return;
  }
  console.log(`[users-backup] worker démarré: dump users → ${REPO}/${BASE_PATH}/users.json.gz toutes les ${INTERVAL_H}h`);
  async function loop() {
    try {
      const r = await usersBackupNow();
      if (r.ok) console.log(`[users-backup] ok: ${r.users} users, ${(r.gzSize / 1024).toFixed(1)} KB`);
    } catch (e) { console.error("[users-backup] loop erreur:", e.message); }
    setTimeout(loop, INTERVAL_H * 60 * 60 * 1000);
  }
  setTimeout(loop, 2 * 60 * 1000);
}

export function mountUsersBackupEndpoints(app) {
  const ADMIN_KEY = process.env.ADMIN_KEY;
  app.post("/api/admin/users-backup-now", async (req, res) => {
    if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) return res.status(403).json({ error: "forbidden" });
    try { const r = await usersBackupNow(); res.json(r); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
}
