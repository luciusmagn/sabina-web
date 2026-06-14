/* The page is rendered by the backend from content.json (see the Tera
   template). This script only adds behaviour: theme + language toggles,
   the orb's boing, and opening the overlays / lightbox. All copy already
   lives in the DOM — bilingual text carries data-cs / data-en (swapped on
   the language toggle); there is no JSON to parse here. */

const root = document.documentElement;
const themeToggle = document.querySelector(".theme-toggle");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let orbUpdateAccent = () => {}; // the water-fill orb assigns this; re-reads --accent on theme change

let lang = "cs";
try {
  const saved = localStorage.getItem("lang");
  if (saved === "cs" || saved === "en") {
    lang = saved;
  } else {
    lang = (navigator.language || "cs").toLowerCase().startsWith("cs") ? "cs" : "en";
  }
} catch (e) {
  /* keep Czech */
}

/* --- Theme --- */

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  orbUpdateAccent(); // recolour the orb base for the new theme
  try {
    localStorage.setItem("theme", theme);
  } catch (e) {
    /* private mode — theme just won't persist */
  }
}

themeToggle.setAttribute("aria-pressed", String(root.getAttribute("data-theme") === "dark"));
themeToggle.addEventListener("click", () => {
  applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

/* --- The orb tile: boing on click --- */

const boingTile = document.querySelector(".tile--empty");
const BOING_WORDS = ["boing!", "boioioing!", "BOING!", "boing boing!"];

function spawnBoingLabel(x, y) {
  const label = document.createElement("span");
  label.className = "boing-label";
  label.textContent = BOING_WORDS[Math.floor(Math.random() * BOING_WORDS.length)];
  label.style.left = `${x}px`;
  label.style.top = `${y}px`;
  label.style.setProperty("--rot", `${(Math.random() * 30 - 15).toFixed(1)}deg`);
  document.body.append(label);
  label.addEventListener("animationend", () => label.remove());
}

const BOING_KEYFRAMES = [
  { transform: "scale(1, 1)" },
  { transform: "scale(0.9, 0.9)", offset: 0.2 },
  { transform: "scale(1.14, 0.86)", offset: 0.4 },
  { transform: "scale(0.92, 1.1)", offset: 0.6 },
  { transform: "scale(1.06, 0.95)", offset: 0.75 },
  { transform: "scale(0.98, 1.02)", offset: 0.9 },
  { transform: "scale(1, 1)" },
];

let boingAnimation = null;

boingTile.addEventListener("click", (event) => {
  if (reduceMotion.matches) return;
  if (boingAnimation) boingAnimation.cancel();
  boingAnimation = boingTile.animate(BOING_KEYFRAMES, { duration: 700, easing: "ease-out" });

  let { clientX: x, clientY: y } = event;
  if (!x && !y) {
    const r = boingTile.getBoundingClientRect();
    x = r.x + r.width / 2;
    y = r.y + r.height / 2;
  }
  spawnBoingLabel(x, y);
});

/* --- Water-fill orb ---
   A <canvas> inside the orb tile draws the accent sphere (pink light / orange
   dark) and fills with blue water up to the cursor's height while hovered,
   with a wavy surface, gentle pulse, rim and gloss. Paused when off-screen. */
function setupWaterOrb() {
  const btn = boingTile;
  if (!btn || typeof requestAnimationFrame !== "function") return;
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 600;
  canvas.setAttribute("aria-hidden", "true");
  btn.append(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = 600, H = 600, CX = 300, CY = 300, R = 298;
  const lerp = (a, b, t) => a + (b - a) * t;
  const getAccent = () => getComputedStyle(root).getPropertyValue("--accent").trim() || "#ff87b1";
  const getWater = () => (root.getAttribute("data-theme") === "dark" ? "#ffffff" : "#0065f9");

  let accent = getAccent();
  let water = getWater();
  orbUpdateAccent = () => { accent = getAccent(); water = getWater(); };

  let fillLevel = 0, targetFill = 0, pulseT = 0, hovering = false, running = false, raf = 0;

  btn.addEventListener("mouseenter", () => { hovering = true; });
  btn.addEventListener("mouseleave", () => { hovering = false; targetFill = 0; });
  btn.addEventListener("mousemove", (event) => {
    if (!hovering) return;
    const rect = btn.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const my = ((event.clientY - rect.top) / rect.height) * H;
    const mx = ((event.clientX - rect.left) / rect.width) * W;
    if ((mx - CX) ** 2 + (my - CY) ** 2 > R * R) return; // ignore the transparent corners
    targetFill = Math.max(0, Math.min(1, 1 - my / H));
  });

  function frame() {
    ctx.clearRect(0, 0, W, H);
    pulseT += 0.025;
    const scale = 1 + (reduceMotion.matches ? 0 : Math.sin(pulseT) * 0.018);
    fillLevel = lerp(fillLevel, targetFill, 0.06);

    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(scale, scale);
    ctx.translate(-CX, -CY);

    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();

    if (fillLevel > 0.002) {
      const waterTop = CY + R - fillLevel * R * 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.beginPath();
      const x0 = CX - R - 8, x1 = CX + R + 8;
      ctx.moveTo(x0, waterTop);
      ctx.lineTo(x1, waterTop); // flat, solid water line (no wave)
      ctx.lineTo(x1, CY + R + 8);
      ctx.lineTo(x0, CY + R + 8);
      ctx.closePath();
      ctx.fillStyle = water;
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = Math.max(2, R * 0.014);
    ctx.stroke();

    /*
    const gloss = ctx.createRadialGradient(CX - R * 0.284, CY - R * 0.351, R * 0.027, CX - R * 0.203, CY - R * 0.27, R * 0.486);
    gloss.addColorStop(0, "rgba(255,255,255,0.38)");
    gloss.addColorStop(0.45, "rgba(255,255,255,0.08)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.fillStyle = gloss;
    ctx.fill();
    */
    ctx.restore();
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => (entries[0].isIntersecting ? start() : stop())).observe(btn);
  } else {
    start();
  }
}
setupWaterOrb();

/* --- Overlay + lightbox refs --- */

const overlay = document.querySelector(".overlay-card");
const overlayHeading = document.getElementById("overlay-heading");
const overlayBody = overlay.querySelector(".overlay-body");
const overlayClose = overlay.querySelector(".overlay-close");

const lightbox = document.querySelector(".lightbox");
const lightboxMedia = lightbox.querySelector(".lightbox-media");

function openLightbox(src) {
  const img = document.createElement("img");
  img.className = "lightbox-img";
  img.src = src;
  img.alt = "";
  lightboxMedia.replaceChildren(img);
  lightbox.showModal();
}

function openVideoLightbox(src) {
  const video = document.createElement("video");
  video.className = "lightbox-img";
  video.src = src;
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  lightboxMedia.replaceChildren(video);
  lightbox.showModal();
}

lightbox.addEventListener("click", (event) => {
  if (event.target.tagName !== "VIDEO") lightbox.close();
});
lightbox.addEventListener("close", () => lightboxMedia.replaceChildren());

/* --- Tile overlay: flip & expand via the View Transitions API --- */

let sourceTile = null;

function withTransition(update) {
  if (!document.startViewTransition || reduceMotion.matches) {
    update();
    return Promise.resolve();
  }
  return document.startViewTransition(update).finished;
}

function setFlipNames(tile, on) {
  tile.style.viewTransitionName = on ? "flip-card" : "";
}

function headingText(tile) {
  return tile.innerText.replace(/\s+/g, " ").trim();
}

/* Each overlay's content is a server-rendered <template>. We clone it and
   wire up behaviour (lightbox, carousel); the text is already in place. */
function wireOverlay(scope, key) {
  scope.querySelectorAll(".videa-thumb").forEach((btn) => {
    btn.addEventListener("click", () => openVideoLightbox(btn.dataset.videoSrc));
  });
  scope.querySelectorAll(".typo-image").forEach((img) => {
    img.addEventListener("click", () => openLightbox(img.src));
    img.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openLightbox(img.src);
      }
    });
  });
  scope.querySelectorAll(".viz-pad, .produkt-tile").forEach((btn) => {
    const img = btn.querySelector("img");
    if (img) btn.addEventListener("click", () => openLightbox(img.src));
  });
  const carousel = scope.querySelector(".carousel");
  if (carousel) setupCarousel(carousel);
  const pager = scope.querySelector(".vpager");
  if (pager) setupPager(pager);
}

/* Up/down pager: the arrows scroll the panel by one card-height; they dim at
   the ends. (Replaces the scrollbar on the vertical overlays.) */
function setupPager(pager) {
  const scroller = pager.querySelector(".vscroll");
  if (!scroller) return;
  const up = pager.querySelector(".vnav-up");
  const down = pager.querySelector(".vnav-down");
  const page = (dir) =>
    scroller.scrollBy({ top: dir * scroller.clientHeight, behavior: reduceMotion.matches ? "instant" : "smooth" });
  if (up) up.addEventListener("click", () => page(-1));
  if (down) down.addEventListener("click", () => page(1));
  const sync = () => {
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (up) up.disabled = scroller.scrollTop <= 2;
    if (down) down.disabled = scroller.scrollTop >= max - 2;
    alignProduktNav(); // re-align arrows to the now-visible set (no-op elsewhere)
  };
  scroller.addEventListener("scroll", sync);
  sync();
}

/* Profilové fotky carousel: clones of the first/last slide bracket the real
   ones, so wrapping past an end scrolls smoothly into a look-alike clone,
   then jumps invisibly to the real twin once scrolling settles. */
function setupCarousel(carousel) {
  const track = carousel.querySelector(".carousel-track");
  const slides = [...track.children];
  const n = slides.length;
  const loop = n > 1;
  if (loop) {
    track.insertBefore(slides[n - 1].cloneNode(true), slides[0]); // leading clone of last
    track.append(slides[0].cloneNode(true)); // trailing clone of first
  }
  carousel.dataset.start = loop ? "1" : "0"; // first real slide
  const lastIndex = track.children.length - 1;

  function step(dir) {
    const w = track.clientWidth;
    const i = Math.round(track.scrollLeft / w) + dir;
    track.scrollTo({ left: i * w, behavior: reduceMotion.matches ? "instant" : "smooth" });
  }

  let settle;
  track.addEventListener("scroll", () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      const w = track.clientWidth;
      const i = Math.round(track.scrollLeft / w);
      if (loop && i === 0) track.scrollTo({ left: n * w, behavior: "instant" });
      else if (loop && i === lastIndex) track.scrollTo({ left: w, behavior: "instant" });
    }, 130);
  });

  carousel.querySelector(".carousel-btn--prev").addEventListener("click", () => step(-1));
  carousel.querySelector(".carousel-btn--next").addEventListener("click", () => step(1));
}

function fillOverlay(tile) {
  overlayHeading.textContent = headingText(tile);
  overlayBody.replaceChildren();
  const key = tile.dataset.overlay;
  const template = document.getElementById(`overlay-${key}`);
  if (!template) return;
  overlayBody.append(template.content.cloneNode(true));
  wireOverlay(overlayBody, key);
}

/* Each produkt set fits its card-height section; shrinking the masonry width
   (height follows the natural aspect) scales it down with no crop. */
function fitMasonries() {
  for (const screen of document.querySelectorAll(".produkt-screen")) {
    const masonry = screen.querySelector(".produkt-grid, .produkt-rows");
    if (!masonry) continue;
    masonry.style.flex = "";
    masonry.style.width = "";
    const cs = getComputedStyle(screen);
    const availH = screen.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const natH = masonry.offsetHeight;
    const natW = masonry.offsetWidth;
    if (natH > availH && natH > 0) {
      masonry.style.flex = "0 0 auto";
      masonry.style.width = `${availH * (natW / natH)}px`;
    }
    // Align this set's label top with its (vertically-centred) masonry top.
    // Measured live, so it tracks the window instead of a brittle fixed/vw value.
    const text = screen.querySelector(".produkt-text");
    if (text) {
      text.style.marginTop = "0px";
      const delta = masonry.getBoundingClientRect().top - text.getBoundingClientRect().top;
      text.style.marginTop = `${Math.max(0, Math.round(delta))}px`;
    }
  }
  alignProduktNav();
}

/* Sit the produkt pager arrows at the bottom of the visible set's masonry —
   the same centring offset the label uses at the top. */
function alignProduktNav() {
  const pager = overlay.querySelector(".vpager");
  const scroller = pager && pager.querySelector(".vscroll");
  const nav = pager && pager.querySelector(".vnav");
  if (!pager || !scroller || !nav) return;
  const screens = [...scroller.querySelectorAll(".produkt-screen")];
  if (!screens.length) return; // only the produkt overlay has photo rows
  const ch = scroller.clientHeight || 1; // avoid /0 → NaN before the dialog has a size
  const idx = Math.min(screens.length - 1, Math.max(0, Math.round(scroller.scrollTop / ch)));
  const screen = screens[idx];
  if (!screen) return;
  const masonry = screen.querySelector(".produkt-grid, .produkt-rows");
  if (!masonry) return;
  nav.style.bottom = `${Math.max(0, Math.round((pager.clientHeight - masonry.offsetHeight) / 2))}px`;
}

/* The close cross is pinned to the right edge of the rightmost photo in the
   open overlay — measured live, so it lands correctly whatever the scrollbar
   does — and sits at that photo's top-right corner. The carousel pins it to
   the next arrow so the two share a vertical line. Kontakt has no media, so it
   keeps the CSS default (top-right of the card). */
function closeAnchor(key) {
  // The element whose RIGHT edge the cross lines up with, per overlay. All of
  // these are SVGs/photos whose visible edge IS their box edge.
  if (key === "produkt") return overlay.querySelector(".produkt-grid, .produkt-rows"); // set 1
  // typografie: book image is centred, so leave the cross at its default spot
  if (key === "viz") return overlay.querySelector(".vnav--right .vnav-down svg"); // line up with the right-side pager arrows
  if (key === "profilovky") return overlay.querySelector(".carousel-btn--next svg"); // the chevron, not its button
  if (key === "videa") {
    const thumbs = overlay.querySelectorAll(".videa-thumb");
    return thumbs[thumbs.length - 1] || null;
  }
  return null;
}

function positionClose() {
  // Pin the cross's VISIBLE right edge (the SVG, which fills its own box — not
  // the padded button) to the right edge of the page's rightmost photo
  // (carousel: to the next chevron). It keeps its header height; only the
  // horizontal offset moves, so it lines up over the content's true right edge
  // whatever the scrollbar does. The heading is mirrored on the left.
  overlayClose.style.right = "";
  overlayHeading.style.marginLeft = "";
  if (!overlay.open) return;
  // Mobile stacks everything in one column; the cross stays in the header
  // (positioned by CSS) rather than chasing a full-width photo's edge.
  if (window.matchMedia("(max-width: 860px)").matches) return;
  const key = sourceTile && sourceTile.dataset.overlay;
  const anchor = closeAnchor(key);
  if (!anchor) return; // kontakt → CSS defaults (no media to align to)
  const a = anchor.getBoundingClientRect();
  if (!a.width) return;

  const card = overlay.getBoundingClientRect();
  const br = parseFloat(getComputedStyle(overlay).borderRightWidth) || 0;
  const icon = overlayClose.querySelector("svg") || overlayClose;
  const iconInset = overlayClose.getBoundingClientRect().right - icon.getBoundingClientRect().right;
  overlayClose.style.right = `${card.right - br - a.right - iconInset}px`;

  // Carousel: mirror the heading's "P" onto the left chevron.
  if (key === "profilovky") {
    const prev = overlay.querySelector(".carousel-btn--prev svg");
    if (prev) {
      const base = overlayHeading.getBoundingClientRect().left; // left with margin reset above
      overlayHeading.style.marginLeft = `${prev.getBoundingClientRect().left - base}px`;
    }
  }
}

function positionCarousel() {
  const carousel = overlay.querySelector(".carousel");
  const track = carousel && carousel.querySelector(".carousel-track");
  if (track && !track.dataset.positioned) {
    track.scrollLeft = (Number(carousel.dataset.start) || 0) * track.clientWidth;
    track.dataset.positioned = "1";
  }
}

function layoutOverlay() {
  if (!overlay.open) return;
  requestAnimationFrame(() => {
    fitMasonries();
    positionCarousel();
    positionClose();
    // The pager's disabled state was computed before the dialog had a size;
    // recompute now that it's laid out.
    const scroller = overlay.querySelector(".vscroll");
    if (scroller) scroller.dispatchEvent(new Event("scroll"));
  });
}

function openOverlay(tile) {
  sourceTile = tile;
  fillOverlay(tile);
  applyLang(lang); // localise the freshly cloned overlay content
  setFlipNames(tile, true);
  withTransition(() => {
    setFlipNames(tile, false);
    overlay.showModal();
    // Size + pin BEFORE the View Transition snapshots the new state, so the
    // masonry doesn't visibly shrink after the card has finished opening.
    fitMasonries();
    positionCarousel();
    positionClose();
  }).then(layoutOverlay);
}

window.addEventListener("resize", layoutOverlay);

function closeOverlay() {
  const tile = sourceTile;
  sourceTile = null;
  withTransition(() => {
    overlay.close();
    if (tile) setFlipNames(tile, true);
  }).then(() => {
    if (tile) setFlipNames(tile, false);
  });
}

document.querySelectorAll("[data-overlay]").forEach((tile) => {
  tile.addEventListener("click", () => openOverlay(tile));
});

overlayClose.addEventListener("click", closeOverlay);

overlay.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeOverlay();
});

overlay.addEventListener("click", (event) => {
  if (event.target !== overlay) return;
  const r = overlay.getBoundingClientRect();
  const outside =
    event.clientX < r.left || event.clientX > r.right ||
    event.clientY < r.top || event.clientY > r.bottom;
  if (outside) closeOverlay();
});

/* --- Language toggle: swap data-cs / data-en (text) and data-aria-cs /
   data-aria-en (aria-label) in place. The button shows the language you
   switch TO. No JSON — the backend already rendered both languages. --- */

const langToggle = document.querySelector(".lang-toggle");

function applyLang(next) {
  lang = next;
  document.documentElement.lang = next;
  document.querySelectorAll("[data-cs]").forEach((el) => {
    el.innerHTML = next === "cs" ? el.dataset.cs : el.dataset.en;
  });
  document.querySelectorAll("[data-aria-cs]").forEach((el) => {
    el.setAttribute("aria-label", next === "cs" ? el.dataset.ariaCs : el.dataset.ariaEn);
  });
  if (overlay.open && sourceTile) overlayHeading.textContent = headingText(sourceTile);
  try {
    localStorage.setItem("lang", next);
  } catch (e) {
    /* private mode — language just won't persist */
  }
}

langToggle.addEventListener("click", () => {
  applyLang(lang === "cs" ? "en" : "cs");
});

applyLang(lang);
