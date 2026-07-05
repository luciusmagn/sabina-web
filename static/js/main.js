/* The page is rendered by the backend from content.json (see the Tera
   template). This script adds behaviour only: theme + language toggles, the
   round cursor, the real-time sun (flat shadow + disc), the horizontal work
   scrub, the travelling contact chip, overlays and the lightbox. All copy is
   already in the DOM — bilingual text carries data-cs / data-en. */

const root = document.documentElement;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(pointer: fine)");
const wide = window.matchMedia("(min-width: 900px)");

let sundialApply = () => {};

/* ---------------- language ---------------- */

let lang = "cs";
try {
  const saved = localStorage.getItem("lang");
  if (saved === "cs" || saved === "en") lang = saved;
  else lang = (navigator.language || "cs").toLowerCase().startsWith("cs") ? "cs" : "en";
} catch (e) { /* keep Czech */ }

function applyLang(next) {
  lang = next;
  root.lang = next;
  document.querySelectorAll("[data-cs]").forEach((el) => {
    el.innerHTML = next === "cs" ? el.dataset.cs : el.dataset.en;
  });
  document.querySelectorAll("[data-aria-cs]").forEach((el) => {
    el.setAttribute("aria-label", next === "cs" ? el.dataset.ariaCs : el.dataset.ariaEn);
  });
  try { localStorage.setItem("lang", next); } catch (e) { /* private mode */ }
}

const langToggle = document.querySelector(".lang-toggle");
langToggle.addEventListener("click", () => applyLang(lang === "cs" ? "en" : "cs"));

/* ---------------- theme ---------------- */

const themeToggle = document.querySelector(".theme-toggle");

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  sundialApply();
  try { localStorage.setItem("theme", theme); } catch (e) { /* private mode */ }
}

themeToggle.setAttribute("aria-pressed", String(root.getAttribute("data-theme") === "dark"));
themeToggle.addEventListener("click", () => {
  applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

/* ---------------- round cursor (fine pointers only) ---------------- */

function setupCursor() {
  if (!finePointer.matches || reduceMotion.matches) return;
  const dot = document.createElement("div");
  dot.className = "cursor cursor--hidden";
  dot.setAttribute("aria-hidden", "true");
  document.body.append(dot);
  root.classList.add("has-cursor");

  let x = -100, y = -100, cx = -100, cy = -100, raf = 0;

  function frame() {
    cx += (x - cx) * 0.28;
    cy += (y - cy) * 0.28;
    dot.style.left = cx + "px";
    dot.style.top = cy + "px";
    raf = (Math.abs(x - cx) > 0.1 || Math.abs(y - cy) > 0.1)
      ? requestAnimationFrame(frame)
      : 0;
  }

  window.addEventListener("mousemove", (e) => {
    x = e.clientX; y = e.clientY;
    dot.classList.remove("cursor--hidden");
    const on = e.target.closest("a, button, [role=button], input, textarea, select, summary");
    dot.classList.toggle("cursor--hover", Boolean(on));
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });

  document.addEventListener("mouseleave", () => dot.classList.add("cursor--hidden"));
  window.addEventListener("blur", () => dot.classList.add("cursor--hidden"));
}
setupCursor();

/* ---------------- the real sky: flat text shadows ----------------
   Sun/moon position over Prague (her sky — no geolocation prompt). The body's
   azimuth/altitude drive the flat offset shadow behind the hero name and the
   kontakt type — cast opposite the sun, long when it hangs low, moon-cast at
   night. Offsets are em so they scale with each element. Recomputed each
   minute. */

function setupSky() {

  const LAT = 50.08, LON = 14.44;
  const rad = Math.PI / 180;
  const J1970 = 2440588, J2000 = 2451545, dayMs = 86400000;
  const obl = rad * 23.4397;
  const toDays = (date) => date.valueOf() / dayMs - 0.5 + J1970 - J2000;
  const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(obl) - Math.tan(b) * Math.sin(obl), Math.cos(l));
  const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(obl) + Math.cos(b) * Math.sin(obl) * Math.sin(l));
  const sidereal = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

  const sunCoords = (d) => {
    const M = rad * (357.5291 + 0.98560028 * d);
    const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
    return { ra: ra(L, 0), dec: dec(L, 0) };
  };
  const moonCoords = (d) => {
    const L = rad * (218.316 + 13.176396 * d);
    const M = rad * (134.963 + 13.064993 * d);
    const F = rad * (93.272 + 13.22935 * d);
    return { ra: ra(L + rad * 6.289 * Math.sin(M), rad * 5.128 * Math.sin(F)), dec: dec(L + rad * 6.289 * Math.sin(M), rad * 5.128 * Math.sin(F)) };
  };
  function position(date, coords) {
    const lw = rad * -LON, phi = rad * LAT, d = toDays(date), c = coords(d);
    const H = sidereal(d, lw) - c.ra;
    const alt = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
    const azS = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi));
    return { alt: alt / rad, az: (azS / rad + 180 + 360) % 360 };
  }

  function apply() {
    const now = new Date();
    let body = position(now, sunCoords), isMoon = false;
    if (body.alt <= 0) {
      const moon = position(now, moonCoords);
      if (moon.alt > 0) { body = moon; isMoon = true; }
      else body = null;
    }

    if (!body) {
      // both below the horizon — a resting shadow
      root.style.setProperty("--sun-dx", "0.042em");
      root.style.setProperty("--sun-dy", "0.052em");
      return;
    }

    const { alt, az } = body;
    const elev = Math.min(alt / 90, 1);

    // Set in em so the offset scales with each element's own type size
    // (magnitudes tuned against ~190px display type).
    const mag = (22 - elev * 14) * (isMoon ? 0.8 : 1);
    const opp = (az + 180) * rad;
    root.style.setProperty("--sun-dx", (Math.sin(opp) * mag / 190).toFixed(4) + "em");
    root.style.setProperty("--sun-dy", (Math.max(4, Math.cos(opp) * mag * 0.7 + 8) / 190).toFixed(4) + "em");
  }

  sundialApply = apply;
  apply();
  setInterval(apply, 60000);
}
setupSky();

/* ---------------- work: the ring of category cards ----------------
   A circular 3D carousel. The centre card faces the viewer; the others
   recede left and right (offsets wrap around, so it cycles forever). The
   centre card's title + open pill land with a small staggered animation.
   Clicking the centre card flips it over to a vertical project scroller;
   clicking a side card rotates it to the centre. No scroll hijacking. */

function setupRing() {
  const ring = document.querySelector(".ring");
  if (!ring) return;
  const stage = ring.querySelector(".ring-stage");
  const cards = [...ring.querySelectorAll(".rcard")];
  const n = cards.length;
  let cur = 0;

  function land() {
    const front = cards[cur].querySelector(".rcard-front");
    front.classList.remove("land");
    void front.offsetWidth; // restart the animation
    front.classList.add("land");
  }

  function layout() {
    // step > card width leaves a clear gap, so the field shows between cards
    const step = wide.matches ? 50 : 80; // vw between card centres
    // positive = outer edges recede, like a big ball behind pushing them out
    const turn = wide.matches ? 30 : 22;
    cards.forEach((card, i) => {
      let off = (i - cur + n) % n;
      if (off > n / 2) off -= n;
      const a = Math.abs(off);
      card.style.setProperty("--tx", (off * step) + "vw");
      card.style.setProperty("--ry", (off * turn) + "deg");
      card.style.setProperty("--sc", String(1 - Math.min(a, 2) * 0.12));
      card.style.zIndex = String(10 - a);
      card.classList.toggle("is-center", off === 0);
      card.querySelector(".rcard-front").tabIndex = off === 0 ? 0 : -1;
      card.setAttribute("aria-hidden", off === 0 ? "false" : "true");
    });
  }

  function go(dir) {
    if (ring.classList.contains("has-flip")) return;
    cur = (cur + dir + n) % n;
    layout();
    land();
  }

  function flip(card) {
    card.classList.add("is-flipped");
    ring.classList.add("has-flip");
    const deck = card.querySelector(".rback-scroll");
    deck.scrollTop = 0;
    deck.focus({ preventScroll: true });
  }

  function unflip() {
    const card = ring.querySelector(".rcard.is-flipped");
    if (!card) return;
    card.classList.remove("is-flipped");
    ring.classList.remove("has-flip");
    card.querySelector(".rcard-front").focus();
  }

  ring.querySelector(".ring-prev").addEventListener("click", () => go(-1));
  ring.querySelector(".ring-next").addEventListener("click", () => go(1));

  cards.forEach((card, i) => {
    card.querySelector(".rcard-front").addEventListener("click", () => {
      if (card.classList.contains("is-center")) flip(card);
      else if (!ring.classList.contains("has-flip")) { cur = i; layout(); land(); }
    });
  });

  // with no close button, a click anywhere outside the open card closes it
  ring.addEventListener("click", (e) => {
    const open = ring.querySelector(".rcard.is-flipped");
    if (open && !open.contains(e.target)) unflip();
  });

  window.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return; // the lightbox owns Esc
    if (e.key === "Escape") { unflip(); return; }
    if (ring.classList.contains("has-flip")) return;
    const r = ring.getBoundingClientRect();
    const visible = r.top < window.innerHeight * 0.6 && r.bottom > window.innerHeight * 0.4;
    if (!visible) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
  });

  // the mouse wheel rotates the ring too (both directions) while the section
  // fills the view. After a full loop in one direction it releases, so the
  // page can always be scrolled past; a flipped card keeps native scrolling.
  let wheelLock = 0, runDir = 0, runCount = 0, released = false;
  window.addEventListener("wheel", (e) => {
    if (reduceMotion.matches) return;
    if (ring.classList.contains("has-flip")) return; // the deck scrolls natively
    const r = ring.getBoundingClientRect();
    const covering = r.top < window.innerHeight * 0.25 && r.bottom > window.innerHeight * 0.75;
    if (!covering) { runCount = 0; released = false; return; }
    const dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
    if (!dir) return;
    if (dir !== runDir) { runDir = dir; runCount = 0; released = false; }
    if (released) return; // seen the whole ring — let the page move on
    e.preventDefault();
    const now = Date.now();
    if (now - wheelLock < 450 || Math.abs(e.deltaY) < 8) return;
    wheelLock = now;
    runCount += 1;
    if (runCount >= n) released = true;
    go(dir);
  }, { passive: false });

  // swipe rotates the ring
  let swipeX = null;
  stage.addEventListener("pointerdown", (e) => {
    if (!ring.classList.contains("has-flip")) swipeX = e.clientX;
  });
  window.addEventListener("pointerup", (e) => {
    if (swipeX === null) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
  });

  // media inside the backs
  ring.querySelectorAll(".proj-play").forEach((btn) => {
    btn.addEventListener("click", () => openVideoLightbox(btn.dataset.videoSrc));
  });
  ring.querySelectorAll(".proj-zoom").forEach((btn) => {
    const img = btn.querySelector("img");
    if (img) btn.addEventListener("click", () => openLightbox(img.currentSrc || img.src));
  });

  wide.addEventListener("change", layout);
  window.addEventListener("resize", layout);

  layout();
  land();
  window.__ringLand = land; // retriggered when the section scrolls into view
}
setupRing();

/* ---------------- travelling contact chip ----------------
   Hidden over the hero; appears while browsing the work; docks into its
   outlined slot as the contact section arrives (the AG-chip idea, flat). */

function setupChip() {
  const chip = document.querySelector(".chip");
  const slot = document.querySelector(".chip-slot");
  const hero = document.querySelector(".hero");
  const kontakt = document.querySelector(".kontakt");
  if (!chip || !hero || !kontakt) return;

  let raf = 0;

  function tick() {
    raf = 0;
    const heroGone = hero.getBoundingClientRect().bottom < window.innerHeight * 0.4;
    chip.hidden = !heroGone;
    if (!heroGone) { chip.style.transform = ""; return; }

    if (!slot || getComputedStyle(slot).display === "none") return;

    const k = kontakt.getBoundingClientRect();
    // 0 → contact off-screen · 1 → contact filling the viewport
    const p = Math.min(1, Math.max(0, (window.innerHeight - k.top) / Math.min(window.innerHeight, k.height)));
    if (p <= 0) { chip.style.transform = ""; return; }

    const c = chip.getBoundingClientRect();
    const s = slot.getBoundingClientRect();
    const baseX = c.left - parseFloat(chip.style.getPropertyValue("--tx") || 0);
    const ease = p * p * (3 - 2 * p); // smoothstep
    const dx = (s.left - c.left) * ease;
    const dy = (s.top - c.top) * ease;
    chip.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  }

  function onScroll() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  tick();
}
setupChip();

/* ---------------- lightbox ---------------- */

const lightbox = document.querySelector(".lightbox");
const lightboxMedia = lightbox.querySelector(".lightbox-media");
const lightboxClose = lightbox.querySelector(".lightbox-close");

function openLightbox(src) {
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  lightboxMedia.replaceChildren(img);
  lightbox.showModal();
}

function openVideoLightbox(src) {
  const video = document.createElement("video");
  video.src = src;
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  lightboxMedia.replaceChildren(video);
  lightbox.showModal();
}

lightbox.addEventListener("click", (event) => {
  if (event.target.tagName !== "VIDEO" && event.target !== lightboxClose) lightbox.close();
});
lightboxClose.addEventListener("click", () => lightbox.close());
lightbox.addEventListener("close", () => lightboxMedia.replaceChildren());

/* ---------------- reveal on scroll ---------------- */

function setupReveal() {
  let targets = [...document.querySelectorAll(".hero-inner, .kontakt > *:not(.walker-track), .ring")];
  if (reduceMotion.matches) return;
  targets.forEach((el, i) => {
    el.classList.add("rv");
    el.style.setProperty("--rvd", `${(i % 5) * 0.07}s`);
  });

  /* No IntersectionObserver: plain rect checks, rAF-throttled. Anything in
     view is revealed immediately, so content can never sit hidden waiting
     for an observer that was late (or never fired). */
  let raf = 0;
  function check() {
    raf = 0;
    const limit = window.innerHeight * 0.92;
    targets = targets.filter((el) => {
      const r = el.getBoundingClientRect();
      const visible = r.top < limit && r.bottom > 0 && (r.width || r.height);
      if (visible) {
        el.classList.add("in");
        // re-land the ring's title + pill as the section arrives
        if (el.classList.contains("ring") && window.__ringLand) window.__ringLand();
      }
      return !visible;
    });
    if (!targets.length) {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    }
  }
  function onScroll() { if (!raf) raf = requestAnimationFrame(check); }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  check();
}
setupReveal();

/* ---------------- footer year ---------------- */

const yearEl = document.querySelector(".kontakt-year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

applyLang(lang);
