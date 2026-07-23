/* EcommOcean — main.js
   Header state, mobile drawer, reveal-on-scroll, marketplace picker,
   lead form (with real error handling), Google reviews (optional), misc. */
(function () {
  "use strict";

  var $ = function (s, e) { return (e || document).querySelector(s); };
  var $$ = function (s, e) { return Array.prototype.slice.call((e || document).querySelectorAll(s)); };
  var CFG = window.ECOMM_CONFIG || {};

  /* ---------- footer year ---------- */
  var yr = $("#year");
  if (yr) yr.textContent = String(new Date().getFullYear());

  /* ---------- header scrolled state ---------- */
  var header = $("#header");
  var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 24); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- mobile drawer ---------- */
  var menuBtn = $("#menuBtn");
  var nav = $("#nav");
  function setMenu(open) {
    nav.classList.toggle("open", open);
    document.body.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
    $$("a", nav).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) { setMenu(false); menuBtn.focus(); }
    });
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("open") && !nav.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
    });
  }

  /* ---------- reveal on scroll (respects reduced motion via CSS) ---------- */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    $$(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- marketplace picker ---------- */
  var MARKETS = [
    { n: "Amazon", s: "Seller & Vendor Central, FBA, A+ content, DSP advertising and full account management." },
    { n: "Walmart", s: "WFS onboarding, catalog optimisation, Walmart Connect ads and Pro Seller growth." },
    { n: "Wayfair", s: "CastleGate logistics, rich furniture listings and category-leading home merchandising." },
    { n: "Target+", s: "Invite-only Target Plus launch, curated assortment and drop-ship operations." },
    { n: "Flipkart", s: "India marketplace launch, Flipkart Ads and festive-season scale strategy." },
    { n: "Meesho", s: "Zero-commission catalog scaling and value-tier positioning for India." },
    { n: "Temu", s: "Semi-managed onboarding, pricing strategy and global fulfilment." },
    { n: "Home Depot", s: "Pro-grade listings, bulk and B2B merchandising for home improvement." },
    { n: "Lowe's", s: "Marketplace onboarding, vendor setup and category expansion." },
    { n: "JCPenney", s: "Fashion and home catalog management with promo-driven growth." },
    { n: "Kohl's", s: "Assortment planning and marketing to Kohl's loyal shopper base." },
    { n: "Macy's", s: "Premium listings and brand storytelling for the department-store flagship." },
    { n: "Shopify", s: "Custom Shopify and Hydrogen builds, headless commerce and CRO." },
    { n: "BigCommerce", s: "Enterprise BigCommerce development and multi-storefront architecture." },
    { n: "WooCommerce", s: "WordPress + Woo builds, performance tuning and custom extensions." },
    { n: "Adobe Commerce", s: "Magento / Adobe Commerce enterprise builds and integrations." }
  ];
  var mktList = $("#mktList"), mktDetail = $("#mktDetail");
  if (mktList && mktDetail) {
    var pills = MARKETS.map(function (m, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mkt-pill";
      b.textContent = m.n;
      b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      b.addEventListener("click", function () {
        pills.forEach(function (p) { p.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        showMarket(m);
      });
      mktList.appendChild(b);
      return b;
    });
    var showMarket = function (m) {
      mktDetail.innerHTML =
        '<h3><span class="d" aria-hidden="true"></span>' + m.n + "</h3><p>" + m.s + "</p>";
    };
    showMarket(MARKETS[0]);
  }

  /* ---------- plan pre-fill: clicking a plan CTA notes the plan ---------- */
  var planField = $("#f-plan");
  $$("a[data-plan]").forEach(function (a) {
    a.addEventListener("click", function () {
      if (planField) planField.value = a.getAttribute("data-plan") || "";
    });
  });

  /* ---------- lead form (real submission, real errors) ---------- */
  var form = $("#leadForm"), msg = $("#formMsg"), submitBtn = $("#leadSubmit");
  var waNumber = (CFG.whatsapp || "917982356032").replace(/[^0-9]/g, "");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      msg.className = "form-msg";
      msg.textContent = "";
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";

      var payload = {
        type: "contact",
        name: $("#f-name").value.trim(),
        phone: $("#f-phone").value.trim(),
        email: $("#f-email").value.trim(),
        message: $("#f-msg").value.trim(),
        plan: planField ? planField.value : "",
        website: $("#f-website") ? $("#f-website").value : "" // honeypot
      };

      fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (r) {
          if (r.status === 404) throw new Error("Contact service not found (404) — the /api/lead function is not deployed.");
          if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || "Request failed (" + r.status + ")"); });
          return r.json();
        })
        .then(function () {
          form.reset();
          msg.className = "form-msg ok";
          msg.textContent = "Thanks, " + payload.name.split(" ")[0] + " — we got your message and will reply within one business day.";
        })
        .catch(function (err) {
          var wa = "https://wa.me/" + waNumber + "?text=" +
            encodeURIComponent("Hi EcommOcean — " + payload.name + " here. " + payload.message + " (Phone: " + payload.phone + ")");
          var reason = err && err.message && err.message !== "Failed to fetch"
            ? err.message
            : "We couldn't reach the server.";
          msg.className = "form-msg err";
          msg.innerHTML = reason + " Please try again, or " +
            '<a href="' + wa + '" target="_blank" rel="noopener">send it to us on WhatsApp</a> instead.';
        })
        .then(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = "Send message";
        });
    });
  }

  /* ---------- WhatsApp links from config ---------- */
  if (CFG.whatsapp) {
    var waText = encodeURIComponent(CFG.whatsappText || "Hi EcommOcean — I'd like to grow my brand online. Can you help?");
    var href = "https://wa.me/" + waNumber + "?text=" + waText;
    ["#waFab", "#waLink"].forEach(function (sel) { var el = $(sel); if (el) el.href = href; });
  }

  /* ---------- Google reviews (optional, honest fallback) ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function stars(r) { r = Math.round(r || 0); return "★★★★★☆☆☆☆☆".slice(5 - r, 10 - r); }
  (function initReviews() {
    var el = $("#gReviews");
    if (!el || !CFG.googleMapsKey || !CFG.googlePlaceId) return; // keep static quotes
    window.__initGR = function () {
      try {
        var svc = new google.maps.places.PlacesService(document.createElement("div"));
        svc.getDetails(
          { placeId: CFG.googlePlaceId, fields: ["rating", "user_ratings_total", "reviews"] },
          function (place, status) {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !place || !(place.reviews || []).length) return;
            var head =
              '<div class="rev-head"><span class="rate">' + (place.rating || 0).toFixed(1) + "</span>" +
              '<span class="stars" aria-label="' + Math.round(place.rating || 0) + ' out of 5 stars">' + stars(place.rating) + "</span>" +
              '<span class="cnt">Based on ' + (place.user_ratings_total || 0) + " Google reviews</span></div>";
            var cards = place.reviews.slice(0, 6).map(function (rv) {
              var nm = rv.author_name || "Google user";
              var av = rv.profile_photo_url
                ? '<img src="' + esc(rv.profile_photo_url) + '" alt="" referrerpolicy="no-referrer">'
                : esc(nm.trim().charAt(0).toUpperCase());
              return '<article class="card rev"><div class="top"><span class="av">' + av + "</span><div>" +
                '<div class="nm">' + esc(nm) + '</div><div class="wh">' + esc(rv.relative_time_description || "") + "</div></div></div>" +
                '<div class="stars" aria-label="' + Math.round(rv.rating || 0) + ' out of 5 stars">' + stars(rv.rating) + "</div>" +
                "<p>" + esc(rv.text || "") + "</p></article>";
            }).join("");
            el.innerHTML = head + '<div class="rev-grid">' + cards + "</div>";
          }
        );
      } catch (e) { /* keep static quotes */ }
    };
    var s = document.createElement("script");
    s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(CFG.googleMapsKey) +
      "&libraries=places&callback=__initGR&loading=async";
    s.async = true;
    document.head.appendChild(s);
  })();
})();
