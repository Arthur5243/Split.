/**
 * Bootstrap one-shot : pré-crée des rows users dans la DB locale.
 *
 * Usage : env var BOOTSTRAP_USERS_SEED (JSON array)
 *   [
 *     {"supabase_id": "<uuid>", "email": "...", "pseudo": "...", "provider": "local"},
 *     ...
 *   ]
 *
 * Au 1er boot, chaque entrée est INSERTée dans users (ou updatée si la row
 * existe déjà avec même id/email). Sert à restaurer des comptes connus
 * quand on ne peut pas migrer les données complètes.
 *
 * Idempotent via sentinel /data/.bootstrap-users-seed-done (hash du payload).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data";
const MAIN_DB = process.env.DB_PATH || path.join(DATA_DIR, "matches.db");
const SENTINEL = path.join(DATA_DIR, ".bootstrap-users-seed-done");

export function maybeRunBootstrapUsersSeed() {
  const raw = process.env.BOOTSTRAP_USERS_SEED;
  if (!raw) return;
  let payload;
  try { payload = JSON.parse(raw); }
  catch { console.log("[bootstrap-users-seed] BOOTSTRAP_USERS_SEED invalide JSON, skip"); return; }
  if (!Array.isArray(payload) || payload.length === 0) return;

  const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  try {
    if (fs.existsSync(SENTINEL) && fs.readFileSync(SENTINEL, "utf8").trim() === hash) {
      console.log("[bootstrap-users-seed] déjà appliqué pour ce payload, skip");
      return;
    }
  } catch {}

  setTimeout(() => {
    try {
      if (!fs.existsSync(MAIN_DB)) { console.log("[bootstrap-users-seed] DB absente, skip"); return; }
      const db = new Database(MAIN_DB);
      db.pragma("journal_mode = WAL");

      const findBySupabase = db.prepare("SELECT id FROM users WHERE supabase_id = ? LIMIT 1");
      const findByEmail = db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
      const findByPseudo = db.prepare("SELECT id FROM users WHERE pseudo_lower = ? LIMIT 1");
      const insertStmt = db.prepare(
        `INSERT INTO users (id, pseudo, pseudo_lower, email, supabase_id, provider, profile_ready, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`
      );
      const linkStmt = db.prepare(
        "UPDATE users SET supabase_id = COALESCE(supabase_id, ?), email = COALESCE(email, ?), updated_at = datetime('now') WHERE id = ?"
      );

      const results = [];
      const tx = db.transaction(() => {
        for (const u of payload) {
          const supabaseId = u.supabase_id || null;
          const email = u.email ? String(u.email).toLowerCase() : null;
          const pseudo = (u.pseudo || "").trim();
          const provider = u.provider || "local";
          if (!email && !supabaseId) { results.push({ ...u, status: "no_identifier" }); continue; }
          if (!pseudo || pseudo.length < 2) { results.push({ ...u, status: "no_pseudo" }); continue; }

          const existing = (supabaseId && findBySupabase.get(supabaseId))
                        || (email && findByEmail.get(email));
          if (existing) {
            linkStmt.run(supabaseId, email, existing.id);
            results.push({ email, pseudo, status: "linked", id: existing.id });
            continue;
          }

          const pseudoLower = pseudo.toLowerCase();
          if (findByPseudo.get(pseudoLower)) {
            results.push({ email, pseudo, status: "pseudo_clash" });
            continue;
          }

          const id = u.id || ("u_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
          try {
            insertStmt.run(id, pseudo, pseudoLower, email, supabaseId, provider);
            results.push({ email, pseudo, status: "created", id });
          } catch (e) {
            results.push({ email, pseudo, status: "error", error: e.message });
          }
        }
      });
      tx();
      db.close();

      for (const r of results) console.log("[bootstrap-users-seed]", JSON.stringify(r));
      try { fs.writeFileSync(SENTINEL, hash); } catch {}
      console.log("[bootstrap-users-seed] ✅ terminé");
    } catch (e) {
      console.error("[bootstrap-users-seed] ❌ échec:", e.message);
    }
  }, 6000);
}
