/* ============================================================
   EcommOcean — Node.js server (ZERO dependencies — Node 18+ core only)

   - Serves the static site from /public
   - POST /api/lead  → validates, rate-limits, honeypot-checks,
     appends to data/leads.jsonl AND emails you (if SMTP configured)
   - GET  /config.js → exposes safe public config from .env
   - Security headers, robots.txt, sitemap.xml, 404

   Run:  node server.js        (no npm install needed)
   ============================================================ */
"use strict";

const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { sendMail } = require("./lib/smtp");

/* ---------- tiny .env loader (no dependency) ---------- */
(function loadEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m || line.trim().startsWith("#")) return;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    });
  } catch (_) { /* no .env — fine */ }
})();

const PORT = Number(process.env.PORT || 3000);
const SITE_URL = (process.env.SITE_URL || "https://www.ecommoceans.com").replace(/\/$/, "");
const PUBLIC_DIR = path.join(__dirname, "public");
const LEADS_FILE = path.join(__dirname, "data", "leads.jsonl");
const LEAD_TO = process.env.LEAD_TO_EMAIL || "rahulmishra2697@gmail.com";
const SMTP_OK = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff", ".woff2": "font/woff2", ".xml": "application/xml"
};

/* ---------- helpers ---------- */
function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' https://maps.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://*.googleusercontent.com https://maps.gstatic.com https://maps.googleapis.com",
    "connect-src 'self' https://maps.googleapis.com",
    "frame-ancestors 'none'"
  ].join("; "));
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
}

function sendText(res, status, type, body, cache) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": cache || "no-cache" });
  res.end(body);
}

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("payload too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/* ---------- rate limiter (per IP, in memory) ---------- */
const hits = new Map();
const RATE_MAX = 5, RATE_WINDOW = 10 * 60 * 1000;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  if (arr.length >= RATE_MAX) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr); return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of hits) {
    const live = arr.filter((t) => now - t < RATE_WINDOW);
    if (live.length) hits.set(ip, live); else hits.delete(ip);
  }
}, RATE_WINDOW).unref();

/* ---------- validation ---------- */
const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\-.\s0-9]{7,20}$/;

/* ---------- lead handler ---------- */
async function handleLead(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req, 32 * 1024)); }
  catch (_) { return sendJson(res, 400, { ok: false, error: "Invalid request." }); }

  // Honeypot — pretend success so bots move on
  if (clean(body.website, 200)) return sendJson(res, 200, { ok: true });

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return sendJson(res, 429, { ok: false, error: "Too many requests — please try again in a few minutes." });
  }

  const lead = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    at: new Date().toISOString(),
    type: ["contact", "callback", "newsletter"].includes(body.type) ? body.type : "contact",
    name: clean(body.name, 120),
    phone: clean(body.phone, 20),
    email: clean(body.email, 160),
    message: clean(body.message, 2000),
    plan: clean(body.plan, 60),
    ip
  };

  if (lead.type === "newsletter") {
    if (!EMAIL_RE.test(lead.email)) return sendJson(res, 400, { ok: false, error: "Please enter a valid email address." });
  } else {
    if (lead.name.length < 2) return sendJson(res, 400, { ok: false, error: "Please tell us your name." });
    if (!PHONE_RE.test(lead.phone)) return sendJson(res, 400, { ok: false, error: "Please enter a valid phone number." });
    if (lead.email && !EMAIL_RE.test(lead.email)) return sendJson(res, 400, { ok: false, error: "That email address doesn't look right." });
    if (lead.message.length < 5) return sendJson(res, 400, { ok: false, error: "Please tell us a little about what you sell." });
  }

  // 1) persist to file — never lose a lead
  try {
    await fsp.mkdir(path.dirname(LEADS_FILE), { recursive: true });
    await fsp.appendFile(LEADS_FILE, JSON.stringify(lead) + "\n", "utf8");
  } catch (err) {
    console.error("[lead] file write failed:", err);
    return sendJson(res, 500, { ok: false, error: "Something went wrong on our side. Please try WhatsApp or email instead." });
  }

  // 2) email — best-effort, lead is already saved
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
        to: LEAD_TO,
        replyTo: EMAIL_RE.test(lead.email) ? lead.email : undefined,
        subject: "[EcommOcean] New lead: " + (lead.name || lead.email || lead.phone),
        text
      }
    ).then(
      () => console.log("[mail] lead " + lead.id + " emailed to " + LEAD_TO),
      (err) => console.error("[mail] send failed for lead " + lead.id + ":", err.message)
    );
  }

  console.log("[lead] saved " + lead.id + " (" + lead.type + ") from " + ip);
  sendJson(res, 200, { ok: true, id: lead.id });
}

/* ---------- static files ---------- */
async function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p === "/") p = "/index.html";
  if (!path.extname(p) && !p.endsWith("/")) p += ".html"; // /privacy → privacy.html
  const filePath = path.normalize(path.join(PUBLIC_DIR, p));
  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res); // path traversal guard
  try {
    const data = await fsp.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const cache = /\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(ext) ? "public, max-age=86400" : "no-cache";
    sendText(res, 200, MIME[ext] || "application/octet-stream", data, cache);
  } catch (_) {
    notFound(res);
  }
}

async function notFound(res) {
  try {
    const data = await fsp.readFile(path.join(PUBLIC_DIR, "404.html"));
    sendText(res, 404, "text/html; charset=utf-8", data);
  } catch (_) {
    sendText(res, 404, "text/plain", "Not found");
  }
}

/* ---------- router ---------- */
const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  try {
    if (req.method === "POST" && p === "/api/lead") return await handleLead(req, res);
    if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

    if (p === "/api/health") return sendJson(res, 200, { ok: true, uptime: process.uptime() });

    if (p === "/config.js") {
      const cfg = {
        phone: process.env.PUBLIC_PHONE || "+91 79823 56032",
        whatsapp: process.env.PUBLIC_WHATSAPP || "917982356032",
        whatsappText: process.env.PUBLIC_WHATSAPP_TEXT || "",
        googleMapsKey: process.env.GOOGLE_MAPS_KEY || "",
        googlePlaceId: process.env.GOOGLE_PLACE_ID || ""
      };
      return sendText(res, 200, MIME[".js"], "window.ECOMM_CONFIG=" + JSON.stringify(cfg) + ";");
    }

    if (p === "/robots.txt") {
      return sendText(res, 200, MIME[".txt"], "User-agent: *\nAllow: /\nSitemap: " + SITE_URL + "/sitemap.xml\n");
    }

    if (p === "/sitemap.xml") {
      const pages = ["/", "/privacy.html", "/terms.html"];
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        pages.map((pg) => "  <url><loc>" + SITE_URL + pg + "</loc></url>").join("\n") +
        "\n</urlset>";
      return sendText(res, 200, MIME[".xml"], xml);
    }

    return await serveStatic(req, res, p);
  } catch (err) {
    console.error("[server] error:", err);
    sendJson(res, 500, { ok: false, error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log("EcommOcean running → http://localhost:" + PORT);
  console.log(SMTP_OK
    ? "[mail] SMTP configured — leads will be emailed to " + LEAD_TO
    : "[mail] SMTP not configured — leads saved to " + LEADS_FILE + " only");
});
