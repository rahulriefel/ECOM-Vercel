# EcommOcean Website v2

Full redesign of the EcommOcean site (per the July 2026 audit) with a Node.js backend that actually captures leads.

## What's inside

```
ecommocean/
├── server.js            Node server (ZERO dependencies): static site + lead API + email
├── lib/smtp.js          Minimal built-in SMTP client (465 TLS or 587 STARTTLS, AUTH LOGIN)
├── package.json
├── .env.example         Copy to .env and fill in
├── data/                leads.jsonl is written here (created automatically)
└── public/
    ├── index.html       The redesigned homepage (all content in HTML — SEO-visible)
    ├── privacy.html     Privacy policy (template — get legal review)
    ├── terms.html       Terms of service (template — get legal review)
    ├── 404.html
    ├── css/styles.css   Design system: tokens, one card recipe, type scale
    └── js/main.js       Drawer, reveals, marketplace picker, lead form, Google reviews
```

## Run it

```bash
cp .env.example .env     # then edit .env
node server.js           # → http://localhost:3000
```

Requires Node 18+. **No `npm install` needed** — the server uses only Node's standard library (email included, via `lib/smtp.js`).

## Leads

Every submission to `POST /api/lead` is:

1. **Validated** (name/phone/message, email format) and checked against a honeypot field + per-IP rate limit (5 per 10 min).
2. **Appended to `data/leads.jsonl`** — one JSON object per line. This always happens, so no lead is ever lost.
3. **Emailed to `LEAD_TO_EMAIL`** if SMTP is configured in `.env` (Gmail App Password works: Google Account → Security → App passwords).

View your leads any time:

```bash
cat data/leads.jsonl
```

If submission fails in the browser, the form shows a real error **and offers the visitor a one-click WhatsApp fallback** with their message pre-filled — the lead is never silently dropped.

## Deploying to Vercel (important — different from a normal server)

Vercel doesn't run `server.js` and has **no persistent disk**, so `data/leads.jsonl` is not used there. Instead, `api/lead.js` (included) runs as a serverless function and delivers leads by **email** (and optionally a webhook). Static config comes from `public/config.js` and security headers from `vercel.json` — all already set up.

**Setup (one time):**

1. Push this folder to Vercel (framework preset: **Other**, no build command; Vercel auto-detects `public/` as static and `api/` as functions).
2. In Vercel → your project → **Settings → Environment Variables**, add:
   - `LEAD_TO_EMAIL` = rahulmishra2697@gmail.com
   - `SMTP_HOST` = smtp.gmail.com
   - `SMTP_PORT` = 587
   - `SMTP_USER` = rahulmishra2697@gmail.com
   - `SMTP_PASS` = *(Gmail App Password — Google Account → Security → 2-Step Verification → App passwords)*
   - `SMTP_FROM` = EcommOcean Website <rahulmishra2697@gmail.com>
   - *(optional)* `LEADS_WEBHOOK_URL` = a Google Apps Script / Zapier hook to also collect leads in a Google Sheet
3. **Redeploy** (env vars only apply to new deployments).
4. Submit a test lead on your live site — it should arrive in your Gmail within seconds. Until the env vars are set, the form will honestly tell visitors to use WhatsApp instead (leads are still visible in Vercel → Logs).

## Configuration (.env)

| Variable | Purpose |
|---|---|
| `SITE_URL` | Your live domain — used in sitemap.xml/robots.txt |
| `LEAD_TO_EMAIL` | Where lead emails go |
| `SMTP_*` | Optional email delivery |
| `PUBLIC_PHONE` / `PUBLIC_WHATSAPP` | Shown/wired on the front-end via `/config.js` |
| `GOOGLE_MAPS_KEY` / `GOOGLE_PLACE_ID` | Optional: swaps static quotes for live Google reviews. **Restrict the key** in Google Cloud Console (HTTP referrer + API restrictions) |

## What changed vs the old site (audit fixes)

- **Mobile actually works**: the top-bar overflow bug that forced phones to render at 595px is gone; drawer menu with scroll lock, Escape, `aria-expanded`.
- **Leads captured for real**: forms POST to a live endpoint, check the response, show success *or* error, WhatsApp fallback. (Old site posted into the void and always claimed success.)
- **Honest trust layer**: unverifiable badges ($400M, Inc. 5000) removed; stats reduced to structural claims; reviews section only claims "live from Google" when it actually is.
- **SEO**: all content server-side in HTML, OG/Twitter meta, canonical, JSON-LD (Organization + FAQPage), robots.txt + sitemap.xml, real Privacy/Terms pages.
- **Accessibility**: WCAG-AA contrast throughout, keyboard-accessible FAQ (`<details>`), skip link, focus states, aria labels, 16px inputs (no iOS zoom), `scroll-margin-top` (headings no longer hide under the fixed header), reduced-motion respected.
- **Performance**: no custom cursor / tilt / magnetic buttons / particle canvas; one lightweight SVG signature graphic; 3 font families with minimal weights; CSP + security headers; cacheable static assets.
- **Design system**: tokened colors/spacing/type/radii, one card recipe, one gradient used sparingly, ocean-chart brand signature ("your brand at the centre, marketplaces as ports").

## Before you launch — checklist

- [ ] Point `SITE_URL` and the `<link rel="canonical">` / OG URLs in `index.html` at your real domain (currently `www.ecommoceans.com`). **Note:** brand shows as "ecommocean", domain is "ecommoceans" — pick one spelling everywhere.
- [ ] Replace the placeholder social links in the footer with your real profiles.
- [ ] Verify the case-study figures and client quotes are accurate and approved by those clients.
- [ ] Add a real `og-image.png` (1200×630) to `/public`.
- [ ] Have privacy.html / terms.html reviewed by a lawyer.
- [ ] Set up SMTP and send a test lead end-to-end.
- [ ] Add analytics (GA4) + a consent banner if you enable it.
- [ ] Deploy behind HTTPS (Render / Railway / a VPS with nginx + certbot all work; `NODE_ENV=production` enables HSTS).
