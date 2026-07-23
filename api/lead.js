/* ============================================================
   EcommOcean — Vercel serverless function: POST /api/lead

   On Vercel there is NO persistent disk, so leads reach you by:
     1. EMAIL — set SMTP_* + LEAD_TO_EMAIL in Vercel → Settings →
        Environment Variables (this is the main channel; set it up!)
     2. Optional webhook — set LEADS_WEBHOOK_URL to also POST each
        lead as JSON to a Google Apps Script / Zapier / Make hook
        (useful to collect leads in a Google Sheet).
   Every lead is also written to the function logs as a backup
   (Vercel dashboard → your project → Logs).
   ============================================================ */
"use strict";

const { sendMail } = require("../lib/smtp");

const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\-.\s0-9]{7,20}$/;

/* light rate limit — persists only per warm instance, but combined
   with the honeypot it stops casual abuse */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (arr.length >= 5) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr);
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined) return resolve(req.body); // Vercel pre-parses JSON
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 32 * 1024) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let b;
  try { b = (await readBody(req)) || {}; if (typeof b === "string") b = JSON.parse(b); }
  catch (_) { return res.status(400).json({ ok: false, error: "Invalid request." }); }

  // Honeypot — pretend success so bots move on
  if (clean(b.website, 200)) return res.status(200).json({ ok: true });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests — please try again in a few minutes." });
  }

  const lead = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    at: new Date().toISOString(),
    type: ["contact", "callback", "newsletter"].includes(b.type) ? b.type : "contact",
    name: clean(b.name, 120),
    phone: clean(b.phone, 20),
    email: clean(b.email, 160),
    message: clean(b.message, 2000),
    plan: clean(b.plan, 60),
    ip
  };

  if (lead.type === "newsletter") {
    if (!EMAIL_RE.test(lead.email)) return res.status(400).json({ ok: false, error: "Please enter a valid email address." });
  } else {
    if (lead.name.length < 2) return res.status(400).json({ ok: false, error: "Please tell us your name." });
    if (!PHONE_RE.test(lead.phone)) return res.status(400).json({ ok: false, error: "Please enter a valid phone number." });
    if (lead.email && !EMAIL_RE.test(lead.email)) return res.status(400).json({ ok: false, error: "That email address doesn't look right." });
    if (lead.message.length < 5) return res.status(400).json({ ok: false, error: "Please tell us a little about what you sell." });
  }

  // Always log the full lead — visible in Vercel → Logs, acts as a backup trail
  console.log("[lead]", JSON.stringify(lead));

  const results = [];

  // 1) Email (primary channel on Vercel)
  const SMTP_OK = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  if (SMTP_OK) {
    const text = [
      "New " + lead.type + " lead from the website",
      "",
      "Name:    " + (lead.name || "—"),
      "Phone:   " + (lead.phone || "—"),
      "Email:   " + (lead.email || "—"),
      "Plan:    " + (lead.plan || "—"),
      "Message: " + (lead.message || "—"),
      "",
      "Received: " + lead.at,
      "Lead ID:  " + lead.id
    ].join("\n");
    results.push(
      sendMail(
        {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
          starttls: process.env.SMTP_STARTTLS !== "false"
        },
        {
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: process.env.LEAD_TO_EMAIL || "rahulmishra2697@gmail.com",
          replyTo: EMAIL_RE.test(lead.email) ? lead.email : undefined,
          subject: "[EcommOcean] New lead: " + (lead.name || lead.email || lead.phone),
          text
        }
      ).then(() => "email:sent", (e) => { console.error("[mail]", e.message); return "email:failed"; })
    );
  }

  // 2) Optional webhook (Google Apps Script / Zapier / Make → Google Sheet)
  if (process.env.LEADS_WEBHOOK_URL) {
    results.push(
      fetch(process.env.LEADS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead)
      }).then((r) => "webhook:" + r.status, (e) => { console.error("[webhook]", e.message); return "webhook:failed"; })
    );
  }

  const outcome = await Promise.all(results);

  // If NO delivery channel is configured, tell the visitor honestly
  if (!SMTP_OK && !process.env.LEADS_WEBHOOK_URL) {
    console.error("[lead] " + lead.id + " received but NO delivery channel configured — set SMTP_* env vars in Vercel!");
    return res.status(500).json({ ok: false, error: "Our contact form isn't fully set up yet. Please reach us on WhatsApp instead." });
  }
  // If email was configured but failed (and no webhook succeeded), surface the failure
  if (outcome.length && !outcome.some((o) => o === "email:sent" || String(o).startsWith("webhook:2"))) {
    return res.status(502).json({ ok: false, error: "We couldn't deliver your message just now. Please try WhatsApp instead." });
  }

  return res.status(200).json({ ok: true, id: lead.id });
};
