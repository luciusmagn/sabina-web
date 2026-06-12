const root = document.documentElement;
const toggle = document.querySelector(".theme-toggle");

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  toggle.setAttribute("aria-pressed", String(theme === "dark"));
  try {
    localStorage.setItem("theme", theme);
  } catch (e) {
    /* private mode — theme just won't persist */
  }
}

toggle.setAttribute("aria-pressed", String(root.getAttribute("data-theme") === "dark"));

toggle.addEventListener("click", () => {
  applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

/* --- The pink tile: boing --- */

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

/* Boing runs through the Web Animations API: a CSS class swap would
   replace the element's animation list and restart the sphere-pulse
   gradient mid-breath. */
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

  if (boingAnimation) boingAnimation.cancel(); // restart cleanly on rapid clicks
  boingAnimation = boingTile.animate(BOING_KEYFRAMES, { duration: 700, easing: "ease-out" });

  let { clientX: x, clientY: y } = event;
  if (!x && !y) { // keyboard activation — pop from the tile's centre
    const r = boingTile.getBoundingClientRect();
    x = r.x + r.width / 2;
    y = r.y + r.height / 2;
  }
  spawnBoingLabel(x, y);
});

/* Sphere illusion: the gradient's light point follows the cursor over
   the circle, so the pulse originates from the touched point. CSS
   transitions on the registered --px/--py ease it back to centre. */

boingTile.addEventListener("pointermove", (event) => {
  const r = boingTile.getBoundingClientRect();
  boingTile.style.setProperty("--px", `${((event.clientX - r.left) / r.width * 100).toFixed(1)}%`);
  boingTile.style.setProperty("--py", `${((event.clientY - r.top) / r.height * 100).toFixed(1)}%`);
});

boingTile.addEventListener("pointerleave", () => {
  boingTile.style.removeProperty("--px");
  boingTile.style.removeProperty("--py");
});

/* --- Tile overlay: flip & expand via the View Transitions API.
   The clicked tile and its label get the same view-transition-names as
   the dialog card and heading, so the browser morphs one into the
   other; CSS adds the flip. Falls back to an instant open/close. --- */

const overlay = document.querySelector(".overlay-card");
const overlayHeading = document.getElementById("overlay-heading");
const overlayBody = overlay.querySelector(".overlay-body");
const overlayClose = overlay.querySelector(".overlay-close");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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

/* Placeholder content — swap titles, descriptions and hrefs for the real
   work. Gallery items: href "#" until each photo (full image URL) or
   video (YouTube URL) exists; video items open in a new tab. */

const CAROUSEL_OVERLAYS = { viz: 5, typografie: 5 };

const GALLERY_SPECS = { produkt: 9, profilovky: 9, videa: 3 };

function galleryItems(key) {
  const t = I18N[lang];
  return Array.from({ length: GALLERY_SPECS[key] }, (_, i) => ({
    title: `${t.galleryTitle[key]} ${String(i + 1).padStart(2, "0")}`,
    desc: t.galleryDesc[key],
    href: "#",
    video: key === "videa",
  }));
}

const CHEVRON_SVG =
  '<svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M7 12L16 21L25 12" stroke="currentColor" stroke-width="2"/></svg>';

function buildCarousel(slideCount) {
  const carousel = document.createElement("div");
  carousel.className = "carousel";

  const track = document.createElement("div");
  track.className = "carousel-track";
  for (let i = 0; i < slideCount; i += 1) {
    const slide = document.createElement("div");
    slide.className = "carousel-slide placeholder-surface";
    track.append(slide);
  }

  const t = I18N[lang];
  for (const [cls, label, direction] of [
    ["carousel-btn carousel-btn--prev", t.ariaPrev, -1],
    ["carousel-btn carousel-btn--next", t.ariaNext, 1],
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = cls;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = CHEVRON_SVG;
    btn.addEventListener("click", () => {
      const slides = track.children;
      if (!slides.length) return;
      // Aim at an exact snap point — mandatory snap re-targets anything else.
      // Step = distance between slide starts (width + gap), no style parsing.
      const step = slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : track.clientWidth;
      const index = Math.round(track.scrollLeft / step) + direction;
      const target = Math.max(0, index) * step;
      const from = track.scrollLeft;
      track.scrollTo({ left: target, behavior: reduceMotion.matches ? "instant" : "smooth" });
      // Some engines silently drop the smooth animation — if nothing has
      // moved within two frames, jump straight to the target.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (track.scrollLeft === from && from !== target) {
          track.scrollTo({ left: target, behavior: "instant" });
        }
      }));
    });
    carousel.append(btn);
  }

  carousel.append(track);
  return carousel;
}

function buildGallery(items) {
  const gallery = document.createElement("div");
  gallery.className = "gallery";

  for (const item of items) {
    const article = document.createElement("article");
    article.className = "gallery-item";

    const thumb = document.createElement("a");
    thumb.className = "gallery-thumb placeholder-surface";
    thumb.href = item.href;
    thumb.setAttribute("aria-label", item.title);
    if (item.video && item.href !== "#") {
      thumb.target = "_blank";
      thumb.rel = "noopener";
    }
    thumb.addEventListener("click", (event) => {
      if (thumb.getAttribute("href") === "#") event.preventDefault(); // placeholder
    });

    const title = document.createElement("h3");
    title.textContent = item.title;

    const desc = document.createElement("p");
    desc.textContent = item.desc;

    article.append(thumb, title, desc);
    gallery.append(article);
  }

  return gallery;
}

function fillOverlay(tile) {
  overlayHeading.textContent = tile.innerText.replace(/\s+/g, " ").trim();

  // Per-tile card content: a matching <template>, a carousel, or a gallery
  overlayBody.replaceChildren();
  const key = tile.dataset.overlay;
  const template = key && document.getElementById(`overlay-${key}`);
  if (template) {
    overlayBody.append(template.content.cloneNode(true));
  } else if (CAROUSEL_OVERLAYS[key]) {
    overlayBody.append(buildCarousel(CAROUSEL_OVERLAYS[key]));
  } else if (GALLERY_SPECS[key]) {
    overlayBody.append(buildGallery(galleryItems(key)));
  }
}

function openOverlay(tile) {
  sourceTile = tile;
  fillOverlay(tile);
  setFlipNames(tile, true);
  withTransition(() => {
    setFlipNames(tile, false);
    overlay.showModal();
  });
}

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
  event.preventDefault(); // Esc goes through the animated close
  closeOverlay();
});

overlay.addEventListener("click", (event) => {
  // Only the backdrop targets the dialog itself; clicks on content target
  // children. Keyboard/synthetic clicks report (0,0) — without the target
  // check they would read as "outside" and wrongly close the overlay.
  if (event.target !== overlay) return;
  const r = overlay.getBoundingClientRect();
  const outside =
    event.clientX < r.left || event.clientX > r.right ||
    event.clientY < r.top || event.clientY > r.bottom;
  if (outside) closeOverlay();
});

/* --- Language: CZ default, EN alternative. Elements marked with
   data-i18n (innerHTML) or data-i18n-aria (aria-label) swap from the
   dictionary; the button shows the language you switch TO. --- */

const I18N = {
  cs: {
    kontakt: "Kontakt",
    viz: "Vizuální<br>identita",
    produkt: "Produktové<br>fotky",
    profilovky: "Profilové<br>fotky",
    videa: "Videa",
    typografie: "Typografie",
    ariaTheme: "Tmavý režim",
    ariaClose: "Zavřít",
    ariaScroll: "Přejít na práci",
    ariaLang: "Switch to English",
    ariaPrev: "Předchozí",
    ariaNext: "Další",
    galleryTitle: { produkt: "Produkt", profilovky: "Profilovka", videa: "Video" },
    galleryDesc: {
      produkt: "Krátký popis projektu — doplníme.",
      profilovky: "Krátký popis focení — doplníme.",
      videa: "Odkaz na YouTube — doplníme.",
    },
    langButton: "EN",
  },
  en: {
    kontakt: "Contact",
    viz: "Visual<br>identity",
    produkt: "Product<br>photos",
    profilovky: "Profile<br>photos",
    videa: "Videos",
    typografie: "Typography",
    ariaTheme: "Dark mode",
    ariaClose: "Close",
    ariaScroll: "Scroll to my work",
    ariaLang: "Přepnout do češtiny",
    ariaPrev: "Previous",
    ariaNext: "Next",
    galleryTitle: { produkt: "Product", profilovky: "Portrait", videa: "Video" },
    galleryDesc: {
      produkt: "Short project description — coming soon.",
      profilovky: "Short shoot description — coming soon.",
      videa: "YouTube link — coming soon.",
    },
    langButton: "CZ",
  },
};

const langToggle = document.querySelector(".lang-toggle");

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

function applyLang(next) {
  lang = next;
  const t = I18N[next];
  document.documentElement.lang = next;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.innerHTML = t[el.dataset.i18n];
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t[el.dataset.i18nAria]);
  });
  langToggle.textContent = t.langButton;
  if (overlay.open && sourceTile) fillOverlay(sourceTile); // re-render in the new language
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
