/**
 * Bootstrap one-shot : copie la table `matches` (historique de scraping
 * avec map_scores) depuis les DBs de migration locales vers les DBs du
 * volume Railway.
 *
 * - matches-migration.db       -> /data/matches.db          (Valo)
 * - cs2-matches-migration.db   -> /data/cs2-matches.db      (CS2)
 *
 * admin-migration ne gere PAS la table `matches` (seulement user-centric),
 * donc sans ca map_scores reste vide sur le nouveau Railway et l'app
 * affiche "Scores par map en attente" partout.
 *
 * Idempotent via sentinel /data/.bootstrap-matches-import-done (hash des
 * sources). BOOTSTRAP_FORCE=1 force la re-execution.
 *
 * Fait un INSERT OR REPLACE pour upsert sans toucher les nouveaux matchs
 * arrives naturellement via le polling PandaScore.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data";
const MAIN_DB = process.env.DB_PATH || path.join(DATA_DIR, "matches.db");
const CS2_DB = process.env.CS2_DB_PATH || path.join(DATA_DIR, "cs2-matches.db");
const SENTINEL = path.join(DATA_DIR, ".bootstrap-matches-import-done");

const VALO_MIGRATION = path.join(__dirname, "data-backup", "matches-migration.db");
const CS2_MIGRATION = path.join(__dirname, "data-backup", "cs2-matches-migration.db");

function hashFile(p) {
  try {
    const buf = fs.readFileSync(p);
    return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
  } catch { return "none"; }
}

function copyMatchesTable(srcPath, dstPath, label) {
  if (!fs.existsSync(srcPath)) {
    console.log(`[bootstrap-matches-import] ${label}: source absente ${srcPath}, skip`);
    return { label, inserted: 0, skipped: true };
  }
  if (!fs.existsSync(dstPath)) {
    console.log(`[bootstrap-matches-import] ${label}: destination absente ${dstPath}, skip`);
    return { label, inserted: 0, skipped: true };
  }

  const dst = new Database(dstPath);
  try {
    // Lit le schema de matches cote source pour (re)creer si besoin cote dst.
    const srcTmp = new Database(srcPath, { readonly: true });
    const schemaRow = srcTmp.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='matches'"
    ).get();
    const srcCount = srcTmp.prepare("SELECT COUNT(*) as n FROM matches").get()?.n ?? 0;
    srcTmp.close();
    if (!schemaRow || !schemaRow.sql) {
      console.log(`[bootstrap-matches-import] ${label}: table matches introuvable dans la source`);
      dst.close();
      return { label, inserted: 0, skipped: true };
    }
    dst.exec(schemaRow.sql.replace(/CREATE TABLE/i, "CREATE TABLE IF NOT EXISTS"));

    dst.exec(`ATTACH '${srcPath.replace(/'/g, "''")}' AS src`);

    const beforeRow = dst.prepare("SELECT COUNT(*) as n FROM matches").get();
    const before = beforeRow?.n ?? 0;

    // Recupere les colonnes communes aux 2 schemas (si le code a ajoute des
    // colonnes cote dst mais pas src, on filtre).
    const srcCols = dst.prepare("PRAGMA src.table_info(matches)").all().map(c => c.name);
    const dstCols = dst.prepare("PRAGMA table_info(matches)").all().map(c => c.name);
    const common = srcCols.filter(c => dstCols.includes(c));
    const colList = common.map(c => `"${c}"`).join(",");
    const stmt = `INSERT OR REPLACE INTO matches (${colList}) SELECT ${colList} FROM src.matches`;
    const r = dst.prepare(stmt).run();

    const afterRow = dst.prepare("SELECT COUNT(*) as n FROM matches").get();
    const after = afterRow?.n ?? 0;

    dst.exec("DETACH src");
    dst.close();
    console.log(`[bootstrap-matches-import] ${label}: src=${srcCount} dst ${before}->${after} (changes=${r.changes})`);
    return { label, before, after, srcCount, changes: r.changes };
  } catch (e) {
    try { dst.exec("DETACH src"); } catch {}
    dst.close();
    console.error(`[bootstrap-matches-import] ${label}: echec`, e.message);
    return { label, error: e.message };
  }
}

export function maybeRunBootstrapMatchesImport() {
  const force = process.env.BOOTSTRAP_FORCE === "1";
  const hash = hashFile(VALO_MIGRATION) + ":" + hashFile(CS2_MIGRATION);
  try {
    if (!force && fs.existsSync(SENTINEL) && fs.readFileSync(SENTINEL, "utf8").trim() === hash) {
      console.log("[bootstrap-matches-import] deja applique pour ce hash, skip");
      return;
    }
  } catch {}

  setTimeout(() => {
    try {
      const results = [];
      results.push(copyMatchesTable(VALO_MIGRATION, MAIN_DB, "valo"));
      results.push(copyMatchesTable(CS2_MIGRATION, CS2_DB, "cs2"));
      try { fs.writeFileSync(SENTINEL, hash); } catch {}
      console.log("[bootstrap-matches-import] termine", JSON.stringify(results));
    } catch (e) {
      console.error("[bootstrap-matches-import] echec global:", e.message);
    }
  }, 10000);
}
