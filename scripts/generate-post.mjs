// Weekly blog publisher for EcommOcean — NO external API, fully free.
// Publishes the next unpublished post from content/blog-queue.json into the
// site's blog template, then updates the blog index + sitemap.
// Runs in GitHub Actions on a schedule. Refill the queue file anytime.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BLOG = join(ROOT, 'blog');
const ORIGIN = 'https://www.ecommocean.in';
const CATEGORIES = ['Marketplaces', 'E-commerce', 'Advertising', 'Operations', 'SEO'];

const kebab = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// already-published slugs (a post is "published" once its blog/<slug>/ dir exists)
const existingSlugs = readdirSync(BLOG, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);

// load the queue
let queue;
try { queue = JSON.parse(readFileSync(join(ROOT, 'content', 'blog-queue.json'), 'utf8')); }
catch (e) { console.error('Could not read content/blog-queue.json:', e.message); process.exit(1); }
if (!Array.isArray(queue) || !queue.length) { console.error('Queue is empty or invalid.'); process.exit(1); }

// pick the first queued post that hasn't been published yet
const post = queue.find(p => p && p.slug && !existingSlugs.includes(kebab(p.slug)));
if (!post) { console.log('Queue exhausted — every post is already published. Add more to content/blog-queue.json.'); process.exit(0); }

const today = new Date();
const dateISO = today.toISOString().slice(0, 10);
const dateHuman = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// ---- validate & sanitise ----
const slug = kebab(post.slug);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const title = String(post.title || 'Untitled').replace(/[<>]/g, '').trim().slice(0, 90);
const metaDesc = String(post.metaDescription || '').replace(/[<>"]/g, '').trim().slice(0, 158);
const category = CATEGORIES.includes(post.category) ? post.category : 'Marketplaces';
const readMin = Number.isInteger(post.readMinutes) && post.readMinutes >= 5 && post.readMinutes <= 12 ? post.readMinutes : 7;
let body = String(post.bodyHtml || '')
  .replace(/<\/?(script|style|iframe|img|object|embed|link|meta)[^>]*>/gi, '')
  .replace(/ on\w+="[^"]*"/gi, '');
if (body.length < 300) { console.error('Body too short for', slug, '— aborting.'); process.exit(1); }

const url = `${ORIGIN}/blog/${slug}/`;
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: ORIGIN + '/blog/' },
      { '@type': 'ListItem', position: 3, name: title, item: url } ] },
    { '@type': 'BlogPosting', '@id': url + '#article', headline: title, description: metaDesc,
      image: ORIGIN + '/og-image.png', datePublished: dateISO, dateModified: dateISO, inLanguage: 'en-IN',
      mainEntityOfPage: url,
      author: { '@type': 'Person', name: 'Rahul Mishra', url: 'https://www.linkedin.com/in/rahul-mishra-0aba1419b/' },
      publisher: { '@id': ORIGIN + '/#org' } }
  ]
});

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cdefs%3E%3ClinearGradient id='t' x1='0' y1='0' x2='1' y2='.3'%3E%3Cstop offset='0' stop-color='%23E01E86'/%3E%3Cstop offset='1' stop-color='%23FF9A00'/%3E%3C/linearGradient%3E%3ClinearGradient id='r' x1='0' y1='0' x2='.4' y2='1'%3E%3Cstop offset='0' stop-color='%23FF7A00'/%3E%3Cstop offset='1' stop-color='%23E5185F'/%3E%3C/linearGradient%3E%3ClinearGradient id='l' x1='0' y1='0' x2='.4' y2='1'%3E%3Cstop offset='0' stop-color='%238E1F9E'/%3E%3Cstop offset='1' stop-color='%235A1A8C'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M24 3 L42.2 13.5 L24 24 L5.8 13.5 Z' fill='url(%23t)'/%3E%3Cpath d='M42.2 13.5 L42.2 34.5 L24 45 L24 24 Z' fill='url(%23r)'/%3E%3Cpath d='M5.8 13.5 L24 24 L24 45 L5.8 34.5 Z' fill='url(%23l)'/%3E%3Cpath d='M26.9 32 A8.5 8.5 0 1 1 32 26.9' fill='none' stroke='%231B0E26' stroke-width='4.6' stroke-linecap='round'/%3E%3Cpath d='M15.5 24 H31.5' stroke='%231B0E26' stroke-width='4.6' stroke-linecap='round'/%3E%3C/svg%3E";
const LOGO_SVG = '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><defs><linearGradient id="lg-t" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="#E01E86"/><stop offset="1" stop-color="#FF9A00"/></linearGradient><linearGradient id="lg-r" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#FF7A00"/><stop offset="1" stop-color="#E5185F"/></linearGradient><linearGradient id="lg-l" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#8E1F9E"/><stop offset="1" stop-color="#5A1A8C"/></linearGradient></defs><path d="M24 3 L42.2 13.5 L24 24 L5.8 13.5 Z" fill="url(#lg-t)"/><path d="M42.2 13.5 L42.2 34.5 L24 45 L24 24 Z" fill="url(#lg-r)"/><path d="M5.8 13.5 L24 24 L24 45 L5.8 34.5 Z" fill="url(#lg-l)"/><path d="M26.9 32 A8.5 8.5 0 1 1 32 26.9" fill="none" stroke="#1B0E26" stroke-width="4.6" stroke-linecap="round"/><path d="M15.5 24 H31.5" stroke="#1B0E26" stroke-width="4.6" stroke-linecap="round"/></svg>';

const page = `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | EcommOcean</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#03101C">
<meta property="og:type" content="article"><meta property="og:site_name" content="EcommOcean">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="author" content="Rahul Mishra">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/styles.css">
<style>
  .bc{font-size:.85rem;color:#8CA3B6;margin:0 0 10px;display:flex;gap:8px;flex-wrap:wrap}.bc a{color:#8CA3B6;text-decoration:none}.bc a:hover{color:#fff}.bc span{color:#4d6376}
  .article{max-width:720px}
  .byline{display:flex;align-items:center;gap:12px;margin:14px 0 8px;color:#8CA3B6;font-size:.92rem}
  .byline .av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#E01E86,#FF9A00);display:grid;place-items:center;color:#fff;font-weight:700;font-family:'Space Grotesk',sans-serif}
  .byline a{color:#d5e0e9;text-decoration:none;font-weight:600}.byline a:hover{color:#fff}
  .article h2{margin:32px 0 12px;font-size:1.35rem}.article h3{margin:22px 0 6px;font-size:1.05rem;color:#fff}
  .article p{color:#c9d5df;line-height:1.8;margin:0 0 16px}
  .article ul{color:#c9d5df;line-height:1.8;padding-left:22px;margin:0 0 16px}.article li{margin:0 0 8px}
  .article strong{color:#fff}.article a{color:#FF9A00}
  .cta-box{margin-top:36px;padding:24px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.02)}
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="header" id="header"><div class="header-inner">
  <a class="brand" href="/" aria-label="EcommOcean home">${LOGO_SVG}<span>ecomm<span class="o">ocean</span></span></a>
  <nav class="nav" id="nav" aria-label="Main"><a href="/#services">Services</a><a href="/#marketplaces">Marketplaces</a><a href="/#pricing">Pricing</a><a href="/blog/">Blog</a><a href="/#contact">Contact</a></nav>
  <div class="header-cta"><a href="/#audit" class="btn btn-primary btn-sm">Free <span class="hide-xs">growth&nbsp;</span>audit</a><button class="menu-btn" id="menuBtn" aria-expanded="false" aria-controls="nav" aria-label="Open menu"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
</div></header>
<main id="main"><section class="band"><div class="wrap">
  <nav class="bc" aria-label="Breadcrumb"><a href="/">Home</a> <span>/</span> <a href="/blog/">Blog</a> <span>/</span> ${esc(title)}</nav>
  <article class="article">
    <p class="label">${esc(category)}</p>
    <h1>${esc(title)}</h1>
    <div class="byline"><span class="av" aria-hidden="true">RM</span><span>By <a href="https://www.linkedin.com/in/rahul-mishra-0aba1419b/" rel="author noopener" target="_blank">Rahul Mishra</a> · ${dateHuman} · ${readMin} min read</span></div>
    ${body}
    <div class="cta-box">
      <p style="margin:0 0 12px;color:#c9d5df">Want a hand putting this into practice? EcommOcean runs <a href="/services/marketplace-management/">marketplace management</a> across 16 channels, and every engagement starts with a free 48-hour audit.</p>
      <a href="/#audit" class="btn btn-primary" data-plan="Blog — ${esc(slug)}">Get your free growth audit</a>
    </div>
  </article>
</div></section></main>
<footer><div class="wrap"><div class="f-grid">
  <div class="f-brand"><a class="brand" href="/">${LOGO_SVG}<span>ecomm<span class="o">ocean</span></span></a><p>Websites, apps and full marketplace management for brands that sell online. New Delhi, serving sellers worldwide.</p></div>
  <nav class="f-col" aria-label="Services"><h4>Services</h4><a href="/services/marketplace-management/">Marketplace management</a><a href="/services/ecommerce-development/">E-commerce development</a><a href="/services/app-development/">App development</a><a href="/services/digital-marketing/">Digital marketing &amp; SEO</a></nav>
  <nav class="f-col" aria-label="Company"><h4>Company</h4><a href="/about/">About</a><a href="/blog/">Blog</a><a href="/#pricing">Pricing</a><a href="/#contact">Contact</a></nav>
  <nav class="f-col" aria-label="Legal"><h4>Legal</h4><a href="/privacy.html">Privacy policy</a><a href="/terms.html">Terms of service</a></nav>
</div><div class="f-bottom"><span>© <span id="year">${today.getFullYear()}</span> EcommOcean. All rights reserved.</span><span><a href="tel:+917982356032">+91 79823 56032</a> · <a href="mailto:rahulmishra2697@gmail.com">rahulmishra2697@gmail.com</a></span></div></div></footer>
<script type="application/ld+json">${jsonLd}</script>
<script src="/config.js"></script><script src="/js/main.js" defer></script>
<script defer src="/_vercel/insights/script.js"></script><script defer src="/_vercel/speed-insights/script.js"></script>
</body>
</html>
`;

mkdirSync(join(BLOG, slug), { recursive: true });
writeFileSync(join(BLOG, slug, 'index.html'), page, 'utf8');

// insert a card at the top of the blog index
let idx = readFileSync(join(BLOG, 'index.html'), 'utf8');
const card = `      <div class="post-list">
        <article class="post-card">
          <a href="/blog/${slug}/">
            <p class="post-meta">${dateHuman} · ${esc(category)} · ${readMin} min read</p>
            <h2>${esc(title)}</h2>
            <p>${esc(metaDesc)}</p>
            <span class="more">Read the guide →</span>
          </a>
        </article>`;
if (idx.includes('<div class="post-list">')) {
  idx = idx.replace('      <div class="post-list">', card);
  writeFileSync(join(BLOG, 'index.html'), idx, 'utf8');
}

// add to sitemap
let sm = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
if (!sm.includes(`/blog/${slug}/`)) {
  sm = sm.replace('</urlset>', `  <url><loc>${url}</loc><lastmod>${dateISO}</lastmod><changefreq>yearly</changefreq><priority>0.6</priority></url>\n</urlset>`);
  writeFileSync(join(ROOT, 'sitemap.xml'), sm, 'utf8');
}

console.log('Published from queue:', slug, '—', title);
