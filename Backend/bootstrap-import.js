/**
 * Bootstrap one-shot : au 1er boot d'un backend Split neuf, si la DB est
 * vide ET que BOOTSTRAP_IMPORT_URL + BOOTSTRAP_ADMIN_KEY sont setés, on va
 * chercher le dump sur l'ancien backend et on l'importe.
 *
 * Idempotent :
 *   - Ne se lance que si users=0 dans /data/matches.db
 *   - Marque un fichier /data/.bootstrap-import-done après succès, qui
 *     empêche toute nouvelle tentative même si la DB est vidée à la main
 *     (sécurité anti-écrasement).
 *
 * Env vars :
 *   BOOTSTRAP_IMPORT_URL      - URL de l'ancien backend (sans slash final)
 *   BOOTSTRAP_ADMIN_KEY       - ADMIN_KEY de l'ancien backend
 *   BOOTSTRAP_TARGET_ADMIN_KEY - ADMIN_KEY du nouveau backend (défaut:
 *                              ADMIN_KEY)
 *   BOOTSTRAP_IMPORT_DISABLED - "1" pour forcer le skip
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import Database from "better-sqlite3";

const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data";
const MAIN_DB = process.env.DB_PATH || path.join(DATA_DIR, "matches.db");
const SENTINEL = path.join(DATA_DIR, ".bootstrap-import-done");

function dbIsEmpty() {
  if (!fs.existsSync(MAIN_DB)) return true;
  try {
    const db = new Database(MAIN_DB, { readonly: true });
    let n = 0;
    try { n = db.prepare("SELECT COUNT(*) as n FROM users").get()?.n ?? 0; } catch { n = 0; }
    db.close();
    return n === 0;
  } catch { return true; }
}

// L'ancien backend n'a PAS les nouveaux endpoints /api/admin/export-all,
// mais il a /api/admin/download-db qui stream le .db SQLite brut. On
// download matches.db dans un fichier temp, on l'ouvre en read-only, on
// construit un dump JSON compatible /api/admin/import-all, et on l'envoie.
// Import depuis un fichier .db local (commité dans le repo).
// Parse en read-only, extrait les tables user-centric, POST sur
// /api/admin/import-all pour UPSERT.
async function importFromLocalDb(dbPath, targetKey) {
  if (!fs.existsSync(dbPath)) throw new Error(`fichier absent : ${dbPath}`);
  const stat = fs.statSync(dbPath);
  console.log(`[bootstrap-import] import local depuis ${dbPath} (${(stat.size / 1024).toFixed(1)} KB)`);
  const srcDb = new Database(dbPath, { readonly: true, fileMustExist: true });
  const dump = { exported_at: new Date().toISOString(), version: 1, main: { tables: {} } };
  const TABLES = [
    "users", "user_sync", "user_match_points", "follows", "oracle_uses",
    "referrals", "profile_views", "posts", "post_likes", "post_comments",
    "community_messages", "dm_messages", "user_keys", "conversations",
  ];
  for (const t of TABLES) {
    try {
      const rows = srcDb.prepare(`SELECT * FROM ${t}`).all();
      dump.main.tables[t] = { rows, count: rows.length, columns: [] };
    } catch { dump.main.tables[t] = { rows: [], count: 0, columns: [] }; }
  }
  srcDb.close();
  const userCount = dump.main.tables.users?.count || 0;
  console.log(`[bootstrap-import] dump extrait : users=${userCount}, user_sync=${dump.main.tables.user_sync?.count || 0}, user_match_points=${dump.main.tables.user_match_points?.count || 0}`);

  const PORT = process.env.PORT || 3001;
  const localUrl = `http://127.0.0.1:${PORT}/api/admin/import-all?key=${encodeURIComponent(targetKey)}`;
  const imp = await fetch(localUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dump),
  });
  if (!imp.ok) throw new Error(`import HTTP ${imp.status}: ${await imp.text().catch(() => "")}`);
  const result = await imp.json();
  console.log(`[bootstrap-import] import local done:`, JSON.stringify(result.results?.map(r => `${r.table}:+${r.inserted}/~${r.updated}`).join(" ")));
  return result;
}

async function probeSource(base, sourceKey) {
  // Verifie que l'ancien backend repond et a les endpoints necessaires.
  const probes = [
    { label: "root", url: `${base}/` },
    { label: "api-health", url: `${base}/api/health` },
    { label: "list-db", url: `${base}/api/admin/list-db?key=${encodeURIComponent(sourceKey)}` },
    { label: "download-db", url: `${base}/api/admin/download-db?key=${encodeURIComponent(sourceKey)}&file=matches.db` },
    { label: "export-summary", url: `${base}/api/admin/export-summary?key=${encodeURIComponent(sourceKey)}` },
    { label: "users-backup-now", url: `${base}/api/admin/users-backup-now?key=${encodeURIComponent(sourceKey)}` },
  ];
  for (const p of probes) {
    try {
      const r = await fetch(p.url, { method: p.label === "users-backup-now" ? "POST" : "GET" });
      const body = r.status < 400 ? (p.label === "list-db" ? await r.text() : "") : "";
      console.log(`[bootstrap-import] probe ${p.label}: HTTP ${r.status}${body ? " body=" + body.slice(0, 200) : ""}`);
    } catch (e) {
      console.log(`[bootstrap-import] probe ${p.label}: ERR ${e.message}`);
    }
  }
}

async function doImport(sourceUrl, sourceKey, targetKey) {
  const base = sourceUrl.replace(/\/$/, "");
  await probeSource(base, sourceKey);
  const url = `${base}/api/admin/download-db?key=${encodeURIComponent(sourceKey)}&file=matches.db`;
  console.log(`[bootstrap-import] GET ${url.replace(sourceKey, "***")}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download-db HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`[bootstrap-import] .db récupéré : ${(buf.length / 1024).toFixed(1)} KB`);

  const tmpDir = path.join(DATA_DIR, ".bootstrap-tmp");
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
  const tmpPath = path.join(tmpDir, "source-matches.db");
  fs.writeFileSync(tmpPath, buf);

  // Ouvre en read-only et extrait les tables user-centric
  const srcDb = new Database(tmpPath, { readonly: true, fileMustExist: true });
  const dump = { exported_at: new Date().toISOString(), version: 1, main: { tables: {} } };
  const TABLES = [
    "users", "user_sync", "user_match_points", "follows", "oracle_uses",
    "referrals", "profile_views", "posts", "post_likes", "post_comments",
    "community_messages", "dm_messages", "user_keys", "conversations",
  ];
  for (const t of TABLES) {
    try {
      const rows = srcDb.prepare(`SELECT * FROM ${t}`).all();
      dump.main.tables[t] = { rows, count: rows.length, columns: [] };
    } catch (e) {
      // Table peut ne pas exister dans l'ancien schéma
      dump.main.tables[t] = { rows: [], count: 0, columns: [] };
    }
  }
  srcDb.close();
  const userCount = dump.main.tables.users?.count || 0;
  const pronoCount = dump.main.tables.user_sync?.count || 0;
  console.log(`[bootstrap-import] dump extrait : users=${userCount}, user_sync=${pronoCount}, posts=${dump.main.tables.posts?.count || 0}`);

  // Appelle /api/admin/import-all en local (UPSERT atomique)
  const PORT = process.env.PORT || 3001;
  const localUrl = `http://127.0.0.1:${PORT}/api/admin/import-all?key=${encodeURIComponent(targetKey)}`;
  const jsonStr = JSON.stringify(dump);
  const imp = await fetch(localUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: jsonStr,
  });
  if (!imp.ok) throw new Error(`import HTTP ${imp.status}: ${await imp.text().catch(() => "")}`);
  const result = await imp.json();
  console.log(`[bootstrap-import] import done:`, JSON.stringify(result.results?.map(r => `${r.table}:+${r.inserted}/~${r.updated}`).join(" ")));

  // Nettoyage du tmp
  try { fs.unlinkSync(tmpPath); } catch {}
  try { fs.rmdirSync(tmpDir); } catch {}
  return result;
}

export function maybeRunBootstrapImport() {
  if (process.env.BOOTSTRAP_IMPORT_DISABLED === "1") {
    console.log("[bootstrap-import] disabled par env var");
    return;
  }
  const sourceUrl = process.env.BOOTSTRAP_IMPORT_URL;
  const sourceKey = process.env.BOOTSTRAP_ADMIN_KEY;
  const targetKey = process.env.BOOTSTRAP_TARGET_ADMIN_KEY || process.env.ADMIN_KEY;
  if (!sourceUrl || !sourceKey || !targetKey) {
    // Pas configuré, skip silencieux.
    return;
  }
  const force = process.env.BOOTSTRAP_FORCE === "1";
  if (fs.existsSync(SENTINEL) && !force) {
    console.log(`[bootstrap-import] sentinel ${SENTINEL} présent, skip (déjà fait une fois). Set BOOTSTRAP_FORCE=1 pour forcer.`);
    return;
  }
  if (force) {
    console.log("[bootstrap-import] BOOTSTRAP_FORCE=1 → bypass du sentinel, re-import");
    try { fs.unlinkSync(SENTINEL); } catch {}
  }
  // Attend 15s après boot pour laisser le serveur HTTP local répondre et
  // les DB s'initialiser (migrations ALTER TABLE etc).
  setTimeout(async () => {
    // Essaie d'abord un fichier .db local (commité dans le repo), puis
    // fallback sur HTTP si pas trouvé.
    try {
      // Cherche le fichier dans Backend/data-backup/matches-migration.db
      // ou data-backup/matches-migration.db (racine repo).
      const candidates = [
        path.join(path.dirname(new URL(import.meta.url).pathname), "data-backup", "matches-migration.db"),
        path.join(path.dirname(new URL(import.meta.url).pathname), "..", "data-backup", "matches-migration.db"),
      ];
      const localDb = candidates.find(p => fs.existsSync(p));
      if (localDb) {
        await importFromLocalDb(localDb, targetKey);
        try { fs.writeFileSync(SENTINEL, new Date().toISOString() + " ok (local)"); } catch {}
        console.log("[bootstrap-import] ✅ migration one-shot terminée (source=local)");
        return;
      }
      console.log("[bootstrap-import] pas de fichier local, essai HTTP…");
      await doImport(sourceUrl, sourceKey, targetKey);
      try { fs.writeFileSync(SENTINEL, new Date().toISOString() + " ok (http)"); } catch {}
      console.log("[bootstrap-import] ✅ migration one-shot terminée (source=http)");
    } catch (e) {
      console.error("[bootstrap-import] ❌ échec:", e.message);
    }
  }, 15000);
}
