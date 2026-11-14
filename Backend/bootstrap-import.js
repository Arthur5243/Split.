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

async function doImport(sourceUrl, sourceKey, targetKey) {
  const url = `${sourceUrl.replace(/\/$/, "")}/api/admin/export-all?key=${encodeURIComponent(sourceKey)}&gz=1`;
  console.log(`[bootstrap-import] GET ${url.replace(sourceKey, "***")}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`export HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
  const jsonStr = (isGzip ? zlib.gunzipSync(buf) : buf).toString("utf8");
  const dump = JSON.parse(jsonStr);
  const userCount = dump?.summary?.users ?? dump?.main?.tables?.users?.count ?? 0;
  console.log(`[bootstrap-import] dump récupéré (${(buf.length / 1024).toFixed(1)} KB, users=${userCount})`);
  // Appelle notre propre /api/admin/import-all en local pour profiter du
  // parsing + upsert existants.
  const PORT = process.env.PORT || 3001;
  const localUrl = `http://127.0.0.1:${PORT}/api/admin/import-all?key=${encodeURIComponent(targetKey)}`;
  const imp = await fetch(localUrl, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: Buffer.from(jsonStr, "utf8"),
  });
  if (!imp.ok) throw new Error(`import HTTP ${imp.status}: ${await imp.text().catch(() => "")}`);
  const result = await imp.json();
  console.log(`[bootstrap-import] import done:`, JSON.stringify(result.results?.map(r => `${r.table}:+${r.inserted}/~${r.updated}`).join(" ")));
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
  if (fs.existsSync(SENTINEL)) {
    console.log(`[bootstrap-import] sentinel ${SENTINEL} présent, skip (déjà fait une fois)`);
    return;
  }
  // Attend 15s après boot pour laisser le serveur HTTP local répondre et
  // les DB s'initialiser (migrations ALTER TABLE etc).
  setTimeout(async () => {
    if (!dbIsEmpty()) {
      console.log("[bootstrap-import] DB déjà peuplée (users>0), skip");
      try { fs.writeFileSync(SENTINEL, new Date().toISOString()); } catch {}
      return;
    }
    try {
      await doImport(sourceUrl, sourceKey, targetKey);
      try { fs.writeFileSync(SENTINEL, new Date().toISOString() + " ok"); } catch {}
      console.log("[bootstrap-import] ✅ migration one-shot terminée");
    } catch (e) {
      console.error("[bootstrap-import] ❌ échec:", e.message);
      // Pas de sentinel → nouvelle tentative au prochain redeploy.
    }
  }, 15000);
}
