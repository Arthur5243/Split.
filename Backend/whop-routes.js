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

  const clean = String(secret).trim().replace(/^whsec_/, "");
  const toSign = `${msgId}.${timestamp}.${rawBody}`;

  // Whop/Standard Webhooks : la clé HMAC peut être soit le secret en raw
  // utf-8 (format Whop actuel), soit sa valeur base64-décodée (spec
  // Standard Webhooks d'origine). On tente les deux pour couvrir les deux
  // conventions et parer aux changements futurs.
  const keyCandidates = [
    { name: "raw-utf8", bytes: Buffer.from(clean, "utf8") },
  ];
  try {
    const b64 = Buffer.from(clean, "base64");
    if (b64.length > 0 && b64.length !== Buffer.from(clean, "utf8").length) {
      keyCandidates.push({ name: "base64-decoded", bytes: b64 });
    }
  } catch {}

  const sigs = String(signatures).split(" ");
  const receivedSamples = [];
  const expectedByKey = [];

  for (const { name, bytes } of keyCandidates) {
    const expected = crypto.createHmac("sha256", bytes).update(toSign).digest("base64");
    expectedByKey.push(`${name}=${expected.slice(0, 8)}…(len${bytes.length})`);
    for (const sig of sigs) {
      // "<version>,<base64>" — on garde tout après la 1ère virgule.
      const commaIdx = sig.indexOf(",");
      const val = commaIdx >= 0 ? sig.slice(commaIdx + 1) : sig;
      if (receivedSamples.length < sigs.length) receivedSamples.push(val.slice(0, 8) + "…");
      try {
        const a = Buffer.from(val, "base64");
        const b = Buffer.from(expected, "base64");
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
          console.log(`[whop-verify] ✅ match via clé ${name}`);
          return true;
        }
      } catch { /* length mismatch */ }
    }
  }

  console.warn("[whop-verify] aucun match. bodyLen=" + rawBody.length + " expected=[" + expectedByKey.join(", ") + "] received=[" + receivedSamples.join(",") + "] toSignStart=" + toSign.slice(0, 80));
  return false;
}

// Admin : vire un event_id de processed_webhooks pour autoriser un resend
// (ex: un ancien event marqué traité avant que le lien user soit possible).
// Protégé par ADMIN_KEY — pas d'automatisation côté externe.
router.post("/api/whop/forget-event", (req, res) => {
  const key = req.headers["x-admin-key"] || req.query.key;
  if (!key || key !== process.env.ADMIN_KEY) return res.status(403).json({ error: "forbidden" });
  const eventId = (req.body?.eventId || req.query.eventId || "").toString().trim();
  if (!eventId) return res.status(400).json({ error: "eventId required" });
  const r = db.prepare(`DELETE FROM processed_webhooks WHERE event_id = ?`).run(eventId);
  console.log(`[whop] forget-event ${eventId} (changed=${r.changes})`);
  res.json({ ok: true, changed: r.changes });
});

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
    // On marque "déjà traité" SEULEMENT après avoir réussi à lier l'event
    // à un user Split (cf. plus bas). Sinon un 1er resend qui échoue sur
    // le lien verrouille les resend suivants qui pourraient marcher avec
    // un pending_checkouts élargi ou un register entre-temps.
    const already = db.prepare(`SELECT 1 FROM processed_webhooks WHERE event_id = ?`).get(eventId);
    if (already) {
      console.log("[whop-webhook] event déjà traité:", eventId);
      return;
    }

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
      // Fenêtre large (24h) pour couvrir les cas où le webhook est retry
      // longtemps après le checkout (l'user a payé, reset son app, bouge
      // d'appareil...) et les resend manuels côté dashboard Whop.
      const pending = db.prepare(`SELECT * FROM pending_checkouts WHERE created_at > datetime('now', '-24 hours') ORDER BY created_at DESC LIMIT 1`).get();
      if (pending) {
        email = pending.email;
        console.log(`[whop-webhook] email retrouvé via pending_checkouts (fallback 24h): ${email}`);
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
      if (!matched) {
        console.warn("[whop-webhook] pas de splitUserId ni d'email, impossible de lier (event laissé non-traité, retry possible)");
        return; // ne marque PAS comme traité : le resend suivant pourra retenter
      }
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

    // Marquage "traité" APRÈS traitement réussi. Un event qui tombe ici
    // ne sera plus re-processé sur un resend.
    db.prepare(`INSERT OR IGNORE INTO processed_webhooks (event_id) VALUES (?)`).run(eventId);
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
