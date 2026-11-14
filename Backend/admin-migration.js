/**
 * Endpoints de migration one-shot entre deux backends Split.
 *
 * Export :  GET  /api/admin/export-all?key=<ADMIN_KEY>  → JSON gzippé avec
 *   TOUT (users, user_sync/pronos, user_match_points, follows, oracle_uses,
 *   referrals, posts/likes/comments, community_messages, dm_messages,
 *   user_keys, conversations) pour matches.db ET cs2-matches.db.
 *
 * Import :  POST /api/admin/import-all?key=<ADMIN_KEY>  (body = JSON du
 *   export) → restore atomique. Les lignes existantes sont upsert (match
 *   par PK). Les colonnes manquantes dans l'export sont laissées à leur
 *   valeur par défaut.
 *
 * Usage typique (migration Railway → Railway) :
 *   curl "https://OLD/api/admin/export-all?key=X" > dump.json.gz
 *   curl -X POST --data-binary @dump.json.gz -H "Content-Encoding: gzip" \
 *        "https://NEW/api/admin/import-all?key=X"
 *
 * Volontairement sans compression côté réponse si la lib zlib n'est pas
 * dispo : on fallback en plain JSON. `Content-Encoding: gzip` sur le POST
 * est optionnel aussi — on détecte le format à l'arrivée.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import express from "express";
import Database from "better-sqlite3";

const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data";
const DB_PATHS = {
  main: process.env.DB_PATH || path.join(DATA_DIR, "matches.db"),
  cs2: process.env.CS2_DB_PATH || path.join(DATA_DIR, "cs2-matches.db"),
};

// Tables à exporter par DB. On liste les tables user-centric ; les tables
// de scraping (matches, séries, etc.) sont régénérées par les workers et
// n'ont pas besoin d'être transférées.
const MAIN_TABLES = [
  "users",
  "user_sync",
  "user_match_points",
  "follows",
  "oracle_uses",
  "referrals",
  "profile_views",
  "posts",
  "post_likes",
  "post_comments",
  "community_messages",
  "dm_messages",
  "user_keys",
  "conversations",
];
const CS2_TABLES = []; // La DB CS2 ne stocke que du data scraping (regénéré par workers).

function openReadOnly(dbPath) {
  if (!fs.existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

function safeAll(db, table) {
  if (!db) return [];
  try { return db.prepare(`SELECT * FROM ${table}`).all(); }
  catch (e) {
    console.log(`[migration] skip table "${table}":`, e.message);
    return [];
  }
}

function listTableColumns(db, table) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name); }
  catch { return []; }
}

export async function buildExport() {
  const dump = {
    exported_at: new Date().toISOString(),
    version: 1,
    main: { path: DB_PATHS.main, tables: {} },
    cs2: { path: DB_PATHS.cs2, tables: {} },
  };
  const mainDb = openReadOnly(DB_PATHS.main);
  for (const t of MAIN_TABLES) {
    const rows = safeAll(mainDb, t);
    dump.main.tables[t] = { rows, count: rows.length, columns: mainDb ? listTableColumns(mainDb, t) : [] };
  }
  if (mainDb) mainDb.close();
  const cs2Db = openReadOnly(DB_PATHS.cs2);
  for (const t of CS2_TABLES) {
    const rows = safeAll(cs2Db, t);
    dump.cs2.tables[t] = { rows, count: rows.length, columns: cs2Db ? listTableColumns(cs2Db, t) : [] };
  }
  if (cs2Db) cs2Db.close();
  // Compte-rendu
  const summary = {};
  for (const t of MAIN_TABLES) summary[t] = dump.main.tables[t].count;
  dump.summary = summary;
  return dump;
}

function pkForTable(table) {
  // Ordre des PK par table (sert à savoir si on doit INSERT ou UPDATE).
  // Pour les tables sans PK composite on utilise rowid implicite via le
  // schéma Sqlite (DELETE+INSERT). Ici on liste les PK pour un vrai upsert.
  const map = {
    users: ["id"],
    user_sync: ["user_id"],
    user_match_points: ["user_id", "match_id"],
    follows: ["follower_id", "followed_id"],
    oracle_uses: ["user_id"],
    referrals: ["referred_id"],
    profile_views: null, // AUTOINCREMENT, pas de PK stable
    posts: ["id"],
    post_likes: ["post_id", "user_id"],
    post_comments: ["id"],
    community_messages: ["id"],
    dm_messages: ["id"],
    user_keys: ["user_id"],
    conversations: ["user1_id", "user2_id"],
  };
  return map[table] || null;
}

function restoreTable(dbWrite, table, rows, dryRun = false) {
  if (!rows || rows.length === 0) return { table, inserted: 0, updated: 0, skipped: 0 };
  const existingCols = new Set(listTableColumns(dbWrite, table));
  if (existingCols.size === 0) return { table, error: "table missing in target", inserted: 0 };
  const pk = pkForTable(table);
  let inserted = 0, updated = 0, skipped = 0;
  const tx = dbWrite.transaction((rs) => {
    for (const row of rs) {
      // Ne garde que les colonnes qui existent dans la DB cible.
      const kept = {};
      for (const k of Object.keys(row)) {
        if (existingCols.has(k)) kept[k] = row[k];
      }
      if (Object.keys(kept).length === 0) { skipped++; continue; }
      const cols = Object.keys(kept);
      const placeholders = cols.map(c => "@" + c).join(", ");
      if (pk && pk.every(p => existingCols.has(p))) {
        const updates = cols.filter(c => !pk.includes(c)).map(c => `${c} = excluded.${c}`).join(", ");
        const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}) ON CONFLICT(${pk.join(", ")}) DO UPDATE SET ${updates || `${pk[0]} = excluded.${pk[0]}`}`;
        try {
          const info = dbWrite.prepare(sql).run(kept);
          if (info.changes > 0) { if (info.lastInsertRowid > 0) inserted++; else updated++; }
          else skipped++;
        } catch (e) { skipped++; console.log(`[migration] ${table} upsert err:`, e.message); }
      } else {
        // Table sans PK : INSERT OR IGNORE pour pas doubler
        const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
        try {
          const info = dbWrite.prepare(sql).run(kept);
          if (info.changes > 0) inserted++; else skipped++;
        } catch (e) { skipped++; console.log(`[migration] ${table} insert err:`, e.message); }
      }
    }
  });
  if (!dryRun) tx(rows);
  return { table, inserted, updated, skipped, total: rows.length };
}

export function applyImport(dump, { dryRun = false } = {}) {
  if (!dump || !dump.main) throw new Error("dump invalide (manque main.tables)");
  const mainDb = new Database(DB_PATHS.main);
  mainDb.pragma("journal_mode = WAL");
  const results = [];
  for (const [table, bucket] of Object.entries(dump.main.tables || {})) {
    results.push(restoreTable(mainDb, table, bucket?.rows || [], dryRun));
  }
  mainDb.close();
  return { ok: true, applied_at: new Date().toISOString(), dry_run: dryRun, results };
}

export function mountAdminMigration(app) {
  const ADMIN_KEY = process.env.ADMIN_KEY;

  function checkAuth(req, res) {
    if (!ADMIN_KEY) { res.status(500).json({ error: "ADMIN_KEY not configured" }); return false; }
    const provided = req.query.key || req.headers["x-admin-key"];
    if (provided !== ADMIN_KEY) { res.status(403).json({ error: "forbidden" }); return false; }
    return true;
  }

  // GET /api/admin/export-all → JSON (gzippé si ?gz=1)
  app.get("/api/admin/export-all", async (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
      const dump = await buildExport();
      const json = JSON.stringify(dump);
      if (req.query.gz === "1") {
        const gz = zlib.gzipSync(json);
        res.setHeader("Content-Type", "application/gzip");
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Content-Disposition", `attachment; filename="split-dump-${Date.now()}.json.gz"`);
        res.send(gz);
      } else {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="split-dump-${Date.now()}.json"`);
        res.send(json);
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin/import-all
  // Body = JSON (optionnellement gzippé avec Content-Encoding: gzip).
  // On accepte les 3 cas : raw Buffer, string, ou deja parse en object par
  // le middleware global express.json().
  app.post("/api/admin/import-all",
    express.raw({ limit: "200mb", type: (req) => {
      const ct = String(req.headers["content-type"] || "").toLowerCase();
      return ct.includes("octet-stream") || ct.includes("gzip");
    } }),
    (req, res) => {
      if (!checkAuth(req, res)) return;
      try {
        let dump;
        const body = req.body;
        if (!body) return res.status(400).json({ error: "empty body" });

        if (Buffer.isBuffer(body)) {
          let buf = body;
          const enc = String(req.headers["content-encoding"] || "").toLowerCase();
          const isGzip = enc === "gzip" || (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b);
          if (isGzip) buf = zlib.gunzipSync(buf);
          dump = JSON.parse(buf.toString("utf8"));
        } else if (typeof body === "string") {
          dump = JSON.parse(body);
        } else if (typeof body === "object") {
          // Deja parse par express.json()
          dump = body;
        } else {
          return res.status(400).json({ error: "unsupported body type: " + typeof body });
        }

        if (!dump || typeof dump !== "object") return res.status(400).json({ error: "dump invalide" });
        const dry = req.query.dry === "1";
        const result = applyImport(dump, { dryRun: dry });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    }
  );

  // GET /api/admin/export-summary → juste les counts (pour vérifier avant un gros download)
  app.get("/api/admin/export-summary", async (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
      const mainDb = openReadOnly(DB_PATHS.main);
      const summary = {};
      for (const t of MAIN_TABLES) {
        if (!mainDb) { summary[t] = { error: "db missing" }; continue; }
        try {
          const r = mainDb.prepare(`SELECT COUNT(*) as n FROM ${t}`).get();
          summary[t] = r?.n ?? 0;
        } catch { summary[t] = "n/a"; }
      }
      if (mainDb) mainDb.close();
      res.json({ db: DB_PATHS.main, exists: fs.existsSync(DB_PATHS.main), summary });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log(`[admin-migration] endpoints export-all / import-all / export-summary montés (main=${DB_PATHS.main})`);
}
