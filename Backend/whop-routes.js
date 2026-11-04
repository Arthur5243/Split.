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

const router = Router();

function verifyWhopSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const expected = hmac.digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

router.post("/api/webhooks/whop", async (req, res) => {
  res.status(200).json({ ok: true });

  try {
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const signature = req.headers["whop-signature"] || req.headers["x-whop-signature"] || "";
    const secret = process.env.WHOP_WEBHOOK_SECRET;

    console.log("[whop-webhook] received event, headers:", JSON.stringify(Object.keys(req.headers)));
    console.log("[whop-webhook] body:", rawBody.slice(0, 2000));

    if (secret && signature) {
      const valid = verifyWhopSignature(rawBody, signature, secret);
      if (!valid) {
        console.warn("[whop-webhook] signature invalide, ignoré");
        return;
      }
    } else if (secret) {
      console.warn("[whop-webhook] pas de signature dans les headers, ignoré");
      return;
    }

    const payload = typeof req.body === "object" ? req.body : JSON.parse(rawBody);
    const event = payload.event || payload.action || payload.type;
    const data = payload.data || payload;

    const eventId = data.id || payload.id || `${event}-${Date.now()}`;
    const already = db.prepare(`SELECT 1 FROM processed_webhooks WHERE event_id = ?`).get(eventId);
    if (already) {
      console.log("[whop-webhook] event déjà traité:", eventId);
      return;
    }
    db.prepare(`INSERT OR IGNORE INTO processed_webhooks (event_id) VALUES (?)`).run(eventId);

    const email = (
      data.email ||
      data.user?.email ||
      data.customer?.email ||
      data.membership?.user?.email ||
      data.membership?.email ||
      payload.email ||
      ""
    ).toLowerCase().trim();

    const membershipId = data.id || data.membership_id || data.membership?.id || "";

    console.log(`[whop-webhook] event=${event} email=${email} membershipId=${membershipId}`);

    if (event === "membership.created" || event === "membership.went_valid" || event === "membership.renewed") {
      if (email) {
        const user = getUserByEmail(email);
        if (user) {
          setUserSubscribed(user.id, true);
          console.log(`[whop-webhook] ✅ ${email} → elite (userId=${user.id})`);
        } else {
          db.prepare(`INSERT OR REPLACE INTO pending_subscriptions (email, whop_membership_id, status) VALUES (?, ?, 'elite')`).run(email, membershipId);
          console.log(`[whop-webhook] ⏳ ${email} pas encore inscrit, abonnement en attente`);
        }
      } else {
        console.warn("[whop-webhook] pas d'email dans le payload, impossible de lier");
      }
    } else if (event === "membership.deactivated" || event === "membership.went_invalid" || event === "membership.cancelled") {
      if (email) {
        const user = getUserByEmail(email);
        if (user) {
          setUserSubscribed(user.id, false);
          console.log(`[whop-webhook] ❌ ${email} → free (userId=${user.id})`);
        }
        db.prepare(`DELETE FROM pending_subscriptions WHERE email = ?`).run(email);
      }
    } else {
      console.log(`[whop-webhook] événement ignoré: ${event}`);
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
