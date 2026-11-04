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
  if (!msgId || !timestamp || !signatures || !secret) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const toSign = `${msgId}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");

  const sigs = signatures.split(" ");
  for (const sig of sigs) {
    const val = sig.replace(/^v1,/, "");
    try {
      if (crypto.timingSafeEqual(Buffer.from(val, "base64"), Buffer.from(expected, "base64"))) return true;
    } catch { /* length mismatch */ }
  }
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
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
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

    let email = (
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

    if (!email) {
      const pending = db.prepare(`SELECT * FROM pending_checkouts WHERE created_at > datetime('now', '-30 minutes') ORDER BY created_at DESC LIMIT 1`).get();
      if (pending) {
        email = pending.email;
        console.log(`[whop-webhook] email retrouvé via pending_checkouts: ${email}`);
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

    if (activate && email) {
      const user = getUserByEmail(email);
      if (user) {
        setUserSubscribed(user.id, true);
        db.prepare(`DELETE FROM pending_checkouts WHERE email = ?`).run(email);
        console.log(`[whop-webhook] ✅ ${email} → elite (userId=${user.id})`);
      } else {
        db.prepare(`INSERT OR REPLACE INTO pending_subscriptions (email, whop_membership_id, status) VALUES (?, ?, 'elite')`).run(email, membershipId);
        console.log(`[whop-webhook] ⏳ ${email} pas encore inscrit, abonnement en attente`);
      }
    } else if (deactivate && email) {
      const user = getUserByEmail(email);
      if (user) {
        setUserSubscribed(user.id, false);
        console.log(`[whop-webhook] ❌ ${email} → free (userId=${user.id})`);
      }
      db.prepare(`DELETE FROM pending_subscriptions WHERE email = ?`).run(email);
    } else if ((activate || deactivate) && !email) {
      console.warn("[whop-webhook] pas d'email dans le payload ni dans pending_checkouts, impossible de lier");
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
