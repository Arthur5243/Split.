/**
 * Bootstrap one-shot : seed la DB locale avec TOUS les users Supabase.
 *
 * Objectif : eviter la popup pseudo pour les comptes qui existaient avant
 * la migration. Au login Supabase, /api/auth/supabase cherche par
 * supabase_id puis par email -> trouve la row pre-creee -> session OK.
 *
 * Nécessite :
 *   SUPABASE_URL                 (deja set)
 *   SUPABASE_SERVICE_ROLE_KEY    (a ajouter — admin key, listée dans
 *                                 Supabase dashboard > Settings > API)
 *
 * Idempotent via sentinel /data/.bootstrap-supabase-seed-done.
 * Set BOOTSTRAP_SUPABASE_FORCE=1 pour re-seed malgre le sentinel.
 *
 * Pseudo detection ordre de priorité :
 *   1. sUser.user_metadata.pseudo
 *   2. sUser.user_metadata.name
 *   3. sUser.user_metadata.full_name
 *   4. email avant @ (ex: "arthur@example.com" → "arthur")
 *
 * N'écrase JAMAIS une row existante (INSERT OR IGNORE).
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data";
const MAIN_DB = process.env.DB_PATH || path.join(DATA_DIR, "matches.db");
const SENTINEL = path.join(DATA_DIR, ".bootstrap-supabase-seed-done");

function slugifyPseudo(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (trimmed.length < 2) return null;
  // Max 20 caracteres, pas de caracteres zarbis
  return trimmed.slice(0, 20);
}

function pseudoFromSupabaseUser(sUser) {
  const meta = sUser?.user_metadata || sUser?.raw_user_meta_data || {};
  const candidates = [meta.pseudo, meta.name, meta.full_name, meta.display_name];
  for (const c of candidates) {
    const p = slugifyPseudo(c);
    if (p) return p;
  }
  // Fallback: préfixe email
  if (sUser?.email) {
    const prefix = String(sUser.email).split("@")[0];
    const p = slugifyPseudo(prefix);
    if (p) return p;
  }
  return null;
}

async function fetchAllSupabaseUsers(url, serviceKey) {
  const users = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const r = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!r.ok) throw new Error(`Supabase admin users HTTP ${r.status}: ${await r.text().catch(() => "")}`);
    const data = await r.json();
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page++;
    if (page > 20) break; // garde-fou
  }
  return users;
}

export async function maybeRunBootstrapSupabaseSeed() {
  const supabaseUrl = (process.env.SUPABASE_URL || "https://raonwislmntafqjfdgcg.supabase.co").replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.log("[bootstrap-supabase-seed] SUPABASE_SERVICE_ROLE_KEY absent, skip");
    return;
  }
  const force = process.env.BOOTSTRAP_SUPABASE_FORCE === "1";
  if (fs.existsSync(SENTINEL) && !force) {
    console.log("[bootstrap-supabase-seed] déjà fait, skip (BOOTSTRAP_SUPABASE_FORCE=1 pour forcer)");
    return;
  }

  setTimeout(async () => {
    try {
      console.log("[bootstrap-supabase-seed] fetch all Supabase users…");
      const sUsers = await fetchAllSupabaseUsers(supabaseUrl, serviceKey);
      console.log(`[bootstrap-supabase-seed] ${sUsers.length} users Supabase récupérés`);

      const db = new Database(MAIN_DB);
      db.pragma("journal_mode = WAL");

      // On considère qu'une row existe déjà si supabase_id OU email OU
      // pseudo_lower match. INSERT OR IGNORE sur la PK id.
      const findStmt = db.prepare(
        "SELECT id, pseudo, email, supabase_id FROM users WHERE supabase_id = ? OR email = ? LIMIT 1"
      );
      const findByPseudoStmt = db.prepare(
        "SELECT id FROM users WHERE pseudo_lower = ? LIMIT 1"
      );
      const insertStmt = db.prepare(
        `INSERT INTO users (id, pseudo, pseudo_lower, email, supabase_id, provider, profile_ready, updated_at)
         VALUES (?, ?, ?, ?, ?, 'local', 1, datetime('now'))`
      );
      const linkStmt = db.prepare(
        "UPDATE users SET supabase_id = ?, email = ? WHERE id = ?"
      );

      let created = 0, linked = 0, skipped = 0, pseudoClash = 0, noPseudo = 0;
      const tx = db.transaction(() => {
        for (const sUser of sUsers) {
          if (!sUser?.id) continue;
          const email = sUser.email ? String(sUser.email).toLowerCase() : null;
          if (!email) continue;

          const existing = findStmt.get(sUser.id, email);
          if (existing) {
            // Row deja la : on lie juste supabase_id/email si manquant
            if (!existing.supabase_id || !existing.email) {
              linkStmt.run(sUser.id, email, existing.id);
              linked++;
            } else {
              skipped++;
            }
            continue;
          }

          const pseudo = pseudoFromSupabaseUser(sUser);
          if (!pseudo) { noPseudo++; continue; }
          const pseudoLower = pseudo.toLowerCase();

          // Si le pseudo est deja pris par un autre user (sans supabase_id),
          // on skip pour eviter un conflit UNIQUE sur pseudo_lower.
          if (findByPseudoStmt.get(pseudoLower)) { pseudoClash++; continue; }

          // Generation id custom (format court comme generateUserId mais simple ici)
          const id = "u_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
          try {
            insertStmt.run(id, pseudo, pseudoLower, email, sUser.id);
            created++;
          } catch (e) {
            console.log(`[bootstrap-supabase-seed] insert err pour ${email}:`, e.message);
            skipped++;
          }
        }
      });
      tx();
      db.close();

      console.log(`[bootstrap-supabase-seed] ✅ créés=${created} liés=${linked} skipped=${skipped} pseudoClash=${pseudoClash} noPseudo=${noPseudo}`);
      try { fs.writeFileSync(SENTINEL, new Date().toISOString()); } catch {}
    } catch (e) {
      console.error("[bootstrap-supabase-seed] ❌ échec:", e.message);
    }
  }, 8000);
}
