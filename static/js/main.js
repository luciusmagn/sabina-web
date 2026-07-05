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

/* ---------------- the real sky: flat sun-shadow + drifting disc ----------------
   Sun/moon position over Prague (her sky — no geolocation prompt). The sun's
   azimuth/altitude drive (a) the flat offset shadow behind the hero name and
   (b) where the disc sits in the hero. After sunset the moon takes over and
   the disc becomes a ring. Recomputed each minute. */

function setupSky() {
  const hero = document.querySelector(".hero");
  const sun = document.querySelector(".sun");
  if (!hero || !sun) return;

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

    sun.classList.toggle("sun--moon", isMoon);

    if (!body) {
      // both below the horizon — park the ring low and give the name a resting shadow
      hero.style.setProperty("--sun-dx", "8px");
      hero.style.setProperty("--sun-dy", "10px");
      hero.style.setProperty("--sun-x", "78%");
      hero.style.setProperty("--sun-y", "64%");
      sun.classList.add("sun--moon");
      return;
    }

    const { alt, az } = body;
    const elev = Math.min(alt / 90, 1);

    // flat offset shadow — cast opposite the body, long when it hangs low.
    // Set in em so it scales with the name (tuned against ~190px display type).
    const mag = (22 - elev * 14) * (isMoon ? 0.8 : 1);
    const opp = (az + 180) * rad;
    hero.style.setProperty("--sun-dx", (Math.sin(opp) * mag / 190).toFixed(4) + "em");
    hero.style.setProperty("--sun-dy", (Math.max(4, Math.cos(opp) * mag * 0.7 + 8) / 190).toFixed(4) + "em");

    // disc position — east (morning) enters right of centre, west leaves left;
    // altitude lifts it toward the top of the field
    const t = Math.min(1, Math.max(0, (az - 60) / 240)); // 60°..300° of azimuth → 0..1
    const xPct = 86 - t * 44;                            // sweeps 86% → 42%
    const yPct = 34 - elev * 26;                         // higher sun → higher disc
    hero.style.setProperty("--sun-x", xPct.toFixed(1) + "%");
    hero.style.setProperty("--sun-y", Math.max(6, yPct).toFixed(1) + "%");

    // gnomon leans opposite the body's azimuth, mirroring the shadow
    hero.style.setProperty("--gnomon", (Math.sin(opp) * 32).toFixed(1) + "deg");
  }

  sundialApply = apply;
  apply();
  setInterval(apply, 60000);
}
setupSky();

/* ---------------- boing (the sun keeps the easter egg) ---------------- */

const BOING_WORDS = ["boing!", "boioioing!", "BOING!", "boing boing!"];
const sunBtn = document.querySelector(".sun");
let boingAnimation = null;

if (sunBtn) {
  sunBtn.addEventListener("click", (event) => {
    if (reduceMotion.matches) return;
    if (boingAnimation) boingAnimation.cancel();
    boingAnimation = sunBtn.animate(
      [
        { transform: "scale(1, 1)" },
        { transform: "scale(0.9, 0.9)", offset: 0.2 },
        { transform: "scale(1.14, 0.86)", offset: 0.4 },
        { transform: "scale(0.92, 1.1)", offset: 0.6 },
        { transform: "scale(1.06, 0.95)", offset: 0.75 },
        { transform: "scale(0.98, 1.02)", offset: 0.9 },
        { transform: "scale(1, 1)" },
      ],
      { duration: 700, easing: "ease-out" }
    );
    let { clientX: x, clientY: y } = event;
    if (!x && !y) {
      const r = sunBtn.getBoundingClientRect();
      x = r.x + r.width / 2;
      y = r.y + r.height / 2;
    }
    const label = document.createElement("span");
    label.className = "boing-label";
    label.textContent = BOING_WORDS[Math.floor(Math.random() * BOING_WORDS.length)];
    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
    label.style.setProperty("--rot", `${(Math.random() * 30 - 15).toFixed(1)}deg`);
    document.body.append(label);
    label.addEventListener("animationend", () => label.remove());
  });
}

/* ---------------- work: horizontal scrub (wide + fine pointer only) ----------------
   The section grows tall; a sticky viewport pins while the track translates
   horizontally with scroll progress. Cards get a gentle scale as they cross
   the viewport centre. Elsewhere the track is a native horizontal scroller —
   no scroll hijacking anywhere, so navigation always lands cleanly. */

function setupScrub() {
  const work = document.querySelector(".work");
  const track = work && work.querySelector(".track");
  if (!work || !track) return;

  const cards = [...track.querySelectorAll(".pcard")];
  const count = document.querySelector(".work-progress-count");
  const total = document.querySelector(".work-progress-total");
  const fill = document.querySelector(".work-progress-fill");
  if (total) total.textContent = String(cards.length).padStart(2, "0");

  let active = false, raf = 0, overflow = 0;

  function measure() {
    if (!active) return;
    overflow = Math.max(0, track.scrollWidth - window.innerWidth);
    work.style.height = `${window.innerHeight + overflow}px`;
    tick();
  }

  function progress() {
    const top = work.getBoundingClientRect().top + window.scrollY;
    const p = (window.scrollY - top) / Math.max(1, overflow);
    return Math.min(1, Math.max(0, p));
  }

  function tick() {
    if (!active) return;
    const p = progress();
    track.style.transform = `translate3d(${(-p * overflow).toFixed(1)}px, 0, 0)`;

    const mid = window.innerWidth / 2;
    let current = 0, best = Infinity;
    cards.forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const c = r.left + r.width / 2;
      const d = Math.abs(c - mid);
      if (d < best) { best = d; current = i; }
      const s = 1 - Math.min(0.06, (d / window.innerWidth) * 0.12);
      card.style.transform = `scale(${s.toFixed(3)})`;
    });

    if (count) count.textContent = String(current + 1).padStart(2, "0");
    if (fill) fill.style.transform = `scaleX(${(p || (1 / cards.length)).toFixed(3)})`;
  }

  function onScroll() {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; tick(); });
  }

  function enable() {
    if (active) return;
    active = true;
    work.classList.add("js-scrub");
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    measure();
  }

  function disable() {
    if (!active) return;
    active = false;
    work.classList.remove("js-scrub");
    work.style.height = "";
    track.style.transform = "";
    cards.forEach((c) => { c.style.transform = ""; });
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", measure);
  }

  function decide() {
    if (wide.matches && finePointer.matches && !reduceMotion.matches) enable();
    else disable();
  }

  decide();
  wide.addEventListener("change", decide);
  reduceMotion.addEventListener("change", decide);

  // keyboard: keep the focused card in view by scrolling the page to its spot
  track.addEventListener("focusin", (e) => {
    if (!active) return;
    const card = e.target.closest(".pcard");
    if (!card) return;
    const i = cards.indexOf(card);
    const top = work.getBoundingClientRect().top + window.scrollY;
    const target = top + (overflow * i) / Math.max(1, cards.length - 1);
    window.scrollTo({ top: target, behavior: "instant" });
    tick();
  });

  // media may finish loading after first measure
  window.addEventListener("load", measure);
}
setupScrub();

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

/* ---------------- overlays ---------------- */

const overlay = document.querySelector(".overlay");
const overlayHeading = document.getElementById("overlay-heading");
const overlayBody = overlay.querySelector(".overlay-body");
const overlayClose = overlay.querySelector(".overlay-close");

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

function openOverlay(key, heading) {
  const template = document.getElementById(`overlay-${key}`);
  if (!template) return;
  overlayHeading.textContent = heading;
  overlayBody.replaceChildren(template.content.cloneNode(true));
  overlayBody.querySelectorAll(".ov-img").forEach((btn) => {
    const img = btn.querySelector("img");
    if (img) btn.addEventListener("click", () => openLightbox(img.src));
  });
  applyLang(lang); // localise the freshly cloned content
  overlay.showModal();
  overlayBody.scrollTop = 0;
}

document.querySelectorAll("[data-overlay]").forEach((card) => {
  card.addEventListener("click", () => {
    const title = card.querySelector(".pcard-title");
    openOverlay(card.dataset.overlay, title ? title.textContent.trim() : "");
    // product cards: jump the overlay to their own set
    if (card.dataset.set !== undefined) {
      const target = overlayBody.querySelector(`.ov-set[data-set="${card.dataset.set}"]`);
      if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
    }
  });
});

document.querySelectorAll("[data-video-src]").forEach((card) => {
  card.addEventListener("click", () => openVideoLightbox(card.dataset.videoSrc));
});

document.querySelectorAll("[data-lightbox-src]").forEach((card) => {
  card.addEventListener("click", () => openLightbox(card.dataset.lightboxSrc));
});

overlayClose.addEventListener("click", () => overlay.close());

overlay.addEventListener("click", (event) => {
  if (event.target !== overlay) return;
  const r = overlay.getBoundingClientRect();
  const outside =
    event.clientX < r.left || event.clientX > r.right ||
    event.clientY < r.top || event.clientY > r.bottom;
  if (outside) overlay.close();
});

/* ---------------- reveal on scroll ---------------- */

function setupReveal() {
  let targets = [...document.querySelectorAll(".hero-inner, .kontakt > *, .pcard")];
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
      if (visible) el.classList.add("in");
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
