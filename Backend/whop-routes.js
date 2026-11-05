import { Router } from "express";
import { getUserByEmail, setUserSubscribed } from "./social-store.js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "matches.db");
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS pending_subscriptions (
    email TEXT PRIMARY KEY,
    whop_membership_id TEXT,
    status TEXT NOT NULL DEFAULT 'elite',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS processed_webhooks (
    event_id TEXT PRIMARY KEY,
    processed_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS pending_checkouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const router = Router();

function verifyStandardWebhookSignature(rawBody, headers, secret) {
  const msgId = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatures = headers["webhook-signature"];
  if (!msgId || !timestamp || !signatures || !secret) {
    console.warn("[whop-verify] manque un champ:", { hasMsgId: !!msgId, hasTs: !!timestamp, hasSig: !!signatures, hasSecret: !!secret });
    return false;
  }

  // Standard Webhooks spec : secret = `whsec_` + base64, on strip le préfixe
  // avant le décode. Certains tenants retournent la clé sans préfixe — on
  // gère les deux cas. On trim aussi pour éviter un \n/ espace copié depuis
  // le dashboard.
  const clean = String(secret).trim().replace(/^whsec_/, "");
  let secretBytes;
  try { secretBytes = Buffer.from(clean, "base64"); } catch { console.warn("[whop-verify] secret base64 invalide"); return false; }
  if (secretBytes.length === 0) { console.warn("[whop-verify] secret base64 vide après décodage"); return false; }

  const toSign = `${msgId}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");

  const sigs = String(signatures).split(" ");
  const receivedSamples = [];
  for (const sig of sigs) {
    // Chaque entrée est `<version>,<base64>` (ex: v1,xxx ou v1a,xxx).
    // On garde tout ce qui est après la virgule, peu importe la version.
    const commaIdx = sig.indexOf(",");
    const val = commaIdx >= 0 ? sig.slice(commaIdx + 1) : sig;
    receivedSamples.push(val.slice(0, 8) + "…");
    try {
      const a = Buffer.from(val, "base64");
      const b = Buffer.from(expected, "base64");
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    } catch { /* length mismatch */ }
  }
  console.warn("[whop-verify] aucun match. secretLen=" + secretBytes.length + " bodyLen=" + rawBody.length + " expected=" + expected.slice(0, 8) + "… received=[" + receivedSamples.join(",") + "] toSignStart=" + toSign.slice(0, 80));
  return false;
}

router.post("/api/whop/checkout-started", (req, res) => {
  const { email, userId } = req.body || {};
  if (!email || !userId) return res.status(400).json({ error: "email and userId required" });
  db.prepare(`DELETE FROM pending_checkouts WHERE email = ?`).run(email.toLowerCase().trim());
  db.prepare(`INSERT INTO pending_checkouts (email, user_id) VALUES (?, ?)`).run(email.toLowerCase().trim(), String(userId));
  console.log(`[whop] checkout démarré: ${email} (userId=${userId})`);
  res.json({ ok: true });
});

router.post("/api/webhooks/whop", async (req, res) => {
  res.status(200).json({ ok: true });

  try {
    const rawBody = req.rawBody || (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
    const secret = process.env.WHOP_WEBHOOK_SECRET;

    console.log("[whop-webhook] received event, headers:", JSON.stringify(Object.keys(req.headers)));
    console.log("[whop-webhook] body:", rawBody.slice(0, 2000));

    if (secret) {
      const valid = verifyStandardWebhookSignature(rawBody, req.headers, secret);
      if (!valid) {
        console.warn("[whop-webhook] signature invalide, ignoré");
        return;
      }
      console.log("[whop-webhook] signature OK");
    }

    const payload = typeof req.body === "object" ? req.body : JSON.parse(rawBody);
    const event = payload.type || payload.event || payload.action;
    const data = payload.data || payload;

    const eventId = payload.id || data.id || `${event}-${Date.now()}`;
    const already = db.prepare(`SELECT 1 FROM processed_webhooks WHERE event_id = ?`).get(eventId);
    if (already) {
      console.log("[whop-webhook] event déjà traité:", eventId);
      return;
    }
    db.prepare(`INSERT OR IGNORE INTO processed_webhooks (event_id) VALUES (?)`).run(eventId);

    const metadata = data.metadata || {};
    const splitUserId = metadata.split_user_id || "";
    const splitEmail = (metadata.split_email || "").toLowerCase().trim();

    let email = (
      splitEmail ||
      data.email ||
      data.user?.email ||
      data.customer?.email ||
      data.member?.email ||
      data.membership?.user?.email ||
      data.membership?.email ||
      payload.email ||
      ""
    ).toLowerCase().trim();

    const membershipId = data.id || data.membership_id || "";
    const whopUserId = data.user_id || data.member_id || "";

    if (!email && splitUserId) {
      const pending = db.prepare(`SELECT * FROM pending_checkouts WHERE user_id = ?`).get(String(splitUserId));
      if (pending) {
        email = pending.email;
        console.log(`[whop-webhook] email retrouvé via metadata.split_user_id=${splitUserId}: ${email}`);
      }
    }

    if (!email) {
      const pending = db.prepare(`SELECT * FROM pending_checkouts WHERE created_at > datetime('now', '-30 minutes') ORDER BY created_at DESC LIMIT 1`).get();
      if (pending) {
        email = pending.email;
        console.log(`[whop-webhook] email retrouvé via pending_checkouts (fallback): ${email}`);
      }
    }

    console.log(`[whop-webhook] event=${event} email=${email} membershipId=${membershipId} whopUserId=${whopUserId}`);

    const status = data.status || data.membership?.status || "";
    let activate = false;
    let deactivate = false;

    if (event === "membership.activated" || event === "member.created") {
      activate = true;
    } else if (event === "membership.deactivated") {
      deactivate = true;
    } else if (event === "membership.updated" || event === "member.updated") {
      if (status === "active" || status === "completed" || status === "trialing") activate = true;
      else if (status === "inactive" || status === "expired" || status === "cancelled") deactivate = true;
      else activate = true;
    } else {
      console.log(`[whop-webhook] événement ignoré: ${event}`);
    }

    if (activate) {
      let matched = false;
      if (splitUserId) {
        setUserSubscribed(splitUserId, true);
        db.prepare(`DELETE FROM pending_checkouts WHERE user_id = ?`).run(String(splitUserId));
        console.log(`[whop-webhook] ✅ splitUserId=${splitUserId} → elite (via metadata)`);
        matched = true;
      } else if (email) {
        const user = getUserByEmail(email);
        if (user) {
          setUserSubscribed(user.id, true);
          db.prepare(`DELETE FROM pending_checkouts WHERE email = ?`).run(email);
          console.log(`[whop-webhook] ✅ ${email} → elite (userId=${user.id})`);
          matched = true;
        } else {
          db.prepare(`INSERT OR REPLACE INTO pending_subscriptions (email, whop_membership_id, status) VALUES (?, ?, 'elite')`).run(email, membershipId);
          console.log(`[whop-webhook] ⏳ ${email} pas encore inscrit, abonnement en attente`);
          matched = true;
        }
      }
      if (!matched) console.warn("[whop-webhook] pas de splitUserId ni d'email, impossible de lier");
    } else if (deactivate) {
      if (splitUserId) {
        setUserSubscribed(splitUserId, false);
        console.log(`[whop-webhook] ❌ splitUserId=${splitUserId} → free (via metadata)`);
      } else if (email) {
        const user = getUserByEmail(email);
        if (user) {
          setUserSubscribed(user.id, false);
          console.log(`[whop-webhook] ❌ ${email} → free (userId=${user.id})`);
        }
        db.prepare(`DELETE FROM pending_subscriptions WHERE email = ?`).run(email);
      }
    }
  } catch (e) {
    console.error("[whop-webhook] erreur traitement:", e.message);
  }
});

export function applyPendingSubscription(email) {
  if (!email) return false;
  const pending = db.prepare(`SELECT * FROM pending_subscriptions WHERE email = ? AND status = 'elite'`).get(email.toLowerCase().trim());
  if (!pending) return false;
  const user = getUserByEmail(email.toLowerCase().trim());
  if (!user) return false;
  setUserSubscribed(user.id, true);
  db.prepare(`DELETE FROM pending_subscriptions WHERE email = ?`).run(email.toLowerCase().trim());
  console.log(`[whop] abonnement en attente appliqué: ${email} → elite`);
  return true;
}

export default router;
