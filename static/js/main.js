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

/* Lightbox: a top-layer dialog (sits above the overlay) showing one image
   or video enlarged. Click anywhere or Esc to close. */
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
  if (event.target.tagName !== "VIDEO") lightbox.close(); // don't close when using video controls
});
lightbox.addEventListener("close", () => { lightboxMedia.replaceChildren(); }); // stop/clear media

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

/* Videa: three videos. #1 is on YouTube (thumbnail → opens YouTube); #2
   and #3 are local mp4s that play in the lightbox. */
const VIDEOS = [
  {
    name: "We Stopped Selling Bitcoin, Here's How",
    work: { cs: "Střih, color grading", en: "Editing, color grading" },
    poster: "/videa/video-1-poster.jpg",
    src: "/videa/video-1.mp4",
    link: "https://www.youtube.com/watch?v=IcKUAGvzCBw",
  },
  {
    name: { cs: "Braiins na X", en: "Braiins on X" },
    work: { cs: "Natáčení, střih, color grading", en: "Shooting, editing, color grading" },
    poster: "/videa/video-2-poster.jpg",
    src: "/videa/video-2.mp4",
    link: "https://x.com/Braiins/status/2062182676161814540",
  },
  {
    name: "Super Mario on the Braiins Deck",
    work: { cs: "Natáčení, střih, color grading", en: "Shooting, editing, color grading" },
    poster: "/videa/video-3-poster.jpg",
    src: "/videa/video-3.mp4",
  },
];

/* Produktové fotky: two sets, scrolled vertically (like Vizuální identita).
   Each screen has a label + description on the left and a masonry of the
   set's photos on the right. Set 1 is a 2×2 grid of equal tiles; set 2 is
   a true masonry (mixed aspect ratios, no crop). */
const PRODUKT_SETS = [
  {
    layout: "grid",
    images: [
      ["/produktove-fotky/set-1/web-1.png", 1.5],
      ["/produktove-fotky/set-1/web-2.png", 1.503],
      ["/produktove-fotky/set-1/web-3.png", 1.535],
      ["/produktove-fotky/set-1/web-4.png", 1.535],
    ],
  },
  {
    // Two rows (2 + 3). Each tile's flex-grow = its aspect ratio, so the
    // rows fill the same box as set 1 with widths proportional to aspect.
    layout: "rows",
    rows: [
      [
        ["/produktove-fotky/set-2/web-1.png", 1.78],
        ["/produktove-fotky/set-2/web-2.png", 1.0],
      ],
      [
        ["/produktove-fotky/set-2/web-3.png", 0.87],
        ["/produktove-fotky/set-2/web-4.png", 1.0],
        ["/produktove-fotky/set-2/web-5.png", 0.86],
      ],
    ],
  },
];

/* Profilové fotky: a horizontal carousel of real photos. */
const PROFILE_PHOTOS = [
  "/profilove-fotky/web-1.jpg",
  "/profilove-fotky/web-2.jpg",
  "/profilove-fotky/web-3.jpg",
  "/profilove-fotky/web-4.jpg",
];

/* Vizuální identita, screen 1: three iPad mockups in a row (space-between);
   the middle one renders a little bigger. */
const VIZ_DEVICES = [
  "/vizualni-identita/ipad-1.png",
  "/vizualni-identita/ipad-2.png",
  "/vizualni-identita/ipad-3.png",
];

/* Typografie: three vertical screens, each a book. Names/authors are
   language-neutral; only the activity word differs (sazba → typesetting). */
const TYPO_SCREENS = [
  { book: "Lightning network", author: "Michal Novák", activity: { cs: "sazba", en: "typesetting" }, image: "/typografie/lightning.png" },
  { book: "Ultimate bitcoin mining guide", author: "Kristian Csepcsar", activity: { cs: "sazba", en: "typesetting" }, image: "/typografie/ultimate-mining-guide.png" },
  { book: "Bitcoin mining handbook", author: "Daniel Frumkin", activity: { cs: "sazba", en: "typesetting" }, image: "/typografie/mining-handbook.png" },
];

const CHEVRON_SVG =
  '<svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M7 12L16 21L25 12" stroke="currentColor" stroke-width="2"/></svg>';

const PLAY_SVG =
  '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="28" cy="28" r="27" fill="rgba(0,0,0,0.42)" stroke="#fff" stroke-width="1.5"/>' +
  '<path d="M23 19L38 28L23 37V19Z" fill="#fff"/></svg>';

/* Videa: a row of three video cards (thumbnail + name + work done). The
   YouTube one opens in a new tab; the mp4s play in the lightbox. */
function buildVidea() {
  const gallery = document.createElement("div");
  gallery.className = "videa";

  for (const v of VIDEOS) {
    const name = typeof v.name === "string" ? v.name : v.name[lang];

    const item = document.createElement("article");
    item.className = "videa-item";

    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "videa-thumb";
    thumb.style.backgroundImage = `url("${v.poster}")`;
    thumb.setAttribute("aria-label", name);
    thumb.innerHTML = PLAY_SVG;
    thumb.addEventListener("click", () => openVideoLightbox(v.src)); // all play in the lightbox

    const heading = document.createElement("h3");
    heading.className = "videa-name";
    if (v.link) {
      // The title links out to the source (YouTube / X)
      const a = document.createElement("a");
      a.href = v.link;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = name;
      heading.append(a);
    } else {
      heading.textContent = name;
    }

    const work = document.createElement("p");
    work.className = "videa-work";
    work.textContent = v.work[lang];

    item.append(thumb, heading, work);
    gallery.append(item);
  }

  return gallery;
}

/* Profilové fotky: photos in a horizontal track you scroll through with a
   slim scrollbar (no arrows). Each photo has a caption below it. */
function buildCarousel(images) {
  const t = I18N[lang];
  const carousel = document.createElement("div");
  carousel.className = "carousel";

  const track = document.createElement("div");
  track.className = "carousel-track";
  for (const src of images) {
    const slide = document.createElement("div");
    slide.className = "carousel-slide";

    const photo = document.createElement("div");
    photo.className = "carousel-photo";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    photo.append(img);

    // Centered caption row: bold title + regular description (placeholder)
    const cap = document.createElement("div");
    cap.className = "carousel-caption";
    const title = document.createElement("strong");
    title.className = "carousel-caption-title";
    title.textContent = "BMM 101";
    const desc = document.createElement("span");
    desc.className = "carousel-caption-desc";
    desc.textContent = t.vizCaption;
    cap.append(title, desc);

    slide.append(photo, cap);
    track.append(slide);
  }

  function step(direction) {
    const w = track.clientWidth;
    const count = images.length;
    const next = Math.round(track.scrollLeft / w) + direction;
    const wrapping = next < 0 || next >= count; // last→first / first→last
    const index = (next + count) % count;
    track.scrollTo({ left: index * w, behavior: (wrapping || reduceMotion.matches) ? "instant" : "smooth" });
  }

  for (const [cls, label, dir] of [
    ["carousel-btn carousel-btn--prev", t.ariaPrev, -1],
    ["carousel-btn carousel-btn--next", t.ariaNext, 1],
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = cls;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = CHEVRON_SVG;
    btn.addEventListener("click", () => step(dir));
    carousel.append(btn);
  }

  carousel.append(track);
  return carousel;
}

/* Vertical scroller for the overlays (Typografie, Vizuální identita,
   Produktové fotky): sections stack and the card scrolls with a slim
   scrollbar — no arrows. */
function makeScroller(sections) {
  const scroller = document.createElement("div");
  scroller.className = "vscroll";
  for (const section of sections) {
    section.classList.add("vsection");
    scroller.append(section);
  }
  return scroller;
}

function typoPanel(screen) {
  const panel = document.createElement("div");
  panel.className = "typo-screen";

  const text = document.createElement("div");
  text.className = "typo-text";

  const group = document.createElement("div");
  group.className = "typo-book-group";
  const book = document.createElement("strong");
  book.className = "typo-book";
  book.textContent = screen.book;
  const author = document.createElement("span");
  author.className = "typo-author";
  author.textContent = screen.author;
  group.append(book, author);

  const activity = document.createElement("strong");
  activity.className = "typo-activity";
  activity.textContent = `/${screen.activity[lang]}/`;

  text.append(group, activity);

  const img = document.createElement("img");
  img.className = "typo-image";
  img.src = screen.image;
  img.alt = `${screen.book} — ${screen.author}`;
  img.loading = "lazy";
  // Click (or Enter/Space) opens the book enlarged in the lightbox.
  img.tabIndex = 0;
  img.setAttribute("role", "button");
  img.setAttribute("aria-label", `${screen.book} — ${I18N[lang].enlarge}`);
  img.addEventListener("click", () => openLightbox(screen.image));
  img.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openLightbox(screen.image);
    }
  });

  panel.append(text, img);
  return panel;
}

function buildTypo() {
  return makeScroller(TYPO_SCREENS.map(typoPanel));
}

// Vizuální identita screen 1: three iPad mockups, middle one bigger.
// Each is a button that opens the screenshot enlarged in the lightbox.
function vizDevicesPanel() {
  const panel = document.createElement("div");
  panel.className = "viz-devices";
  VIZ_DEVICES.forEach((src, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = i === 1 ? "viz-pad viz-pad--mid" : "viz-pad";
    btn.setAttribute("aria-label", I18N[lang].enlarge);
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    btn.append(img);
    btn.addEventListener("click", () => openLightbox(src));
    panel.append(btn);
  });
  return panel;
}

// Vizuální identita screen 2: BMM 101 label, a wide image left, a detail right.
function vizDetailPanel() {
  const panel = document.createElement("div");
  panel.className = "viz-detail";

  const text = document.createElement("div");
  text.className = "viz-detail-text";
  const title = document.createElement("strong");
  title.className = "viz-detail-title";
  title.textContent = "BMM 101";
  const caption = document.createElement("span");
  caption.className = "viz-detail-caption";
  caption.textContent = I18N[lang].vizCaption;
  text.append(title, caption);

  const wide = document.createElement("img");
  wide.className = "viz-detail-wide";
  wide.src = "/vizualni-identita/group-25.png";
  wide.alt = "";
  wide.loading = "lazy";

  const side = document.createElement("img");
  side.className = "viz-detail-side";
  side.src = "/vizualni-identita/group-16.png";
  side.alt = "";
  side.loading = "lazy";

  panel.append(text, wide, side);
  return panel;
}

function buildViz() {
  // Screen 1: the BMM 101 detail. Screen 2: the three iPads.
  return makeScroller([vizDetailPanel(), vizDevicesPanel()]);
}

// Produktové fotky: one screen per set — label + description on the left,
// masonry of clickable photos (→ lightbox) on the right.
function produktTile(src, aspect) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "produkt-tile";
  btn.setAttribute("aria-label", I18N[lang].enlarge);
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.loading = "lazy";
  if (aspect) img.style.aspectRatio = String(aspect); // correct layout before load
  btn.append(img);
  btn.addEventListener("click", () => openLightbox(src));
  return btn;
}

function produktSetPanel(set, index) {
  const t = I18N[lang];
  const panel = document.createElement("div");
  panel.className = "produkt-screen";

  const text = document.createElement("div");
  text.className = "produkt-text";
  const title = document.createElement("strong");
  title.className = "produkt-title";
  title.textContent = `${t.set} 0${index + 1}`;
  const desc = document.createElement("span");
  desc.className = "produkt-desc";
  desc.textContent = t.vizCaption;
  text.append(title, desc);

  if (set.layout === "rows") {
    // Two rows (2 + 3); each tile flex-grows by its aspect ratio so the
    // rows fill the box, widths proportional to aspect.
    const rows = document.createElement("div");
    rows.className = "produkt-rows";
    for (const row of set.rows) {
      const r = document.createElement("div");
      r.className = "produkt-row";
      for (const [src, aspect] of row) {
        const tile = produktTile(src, aspect);
        tile.style.flex = `${aspect} 1 0`;
        r.append(tile);
      }
      rows.append(r);
    }
    panel.append(text, rows);
  } else {
    const grid = document.createElement("div");
    grid.className = "produkt-grid";
    for (const [src, aspect] of set.images) grid.append(produktTile(src, aspect));
    panel.append(text, grid);
  }

  return panel;
}

function buildProdukt() {
  // Two sets stacked vertically; the card scrolls (no arrows). Each set's
  // masonry is at natural size — no crop, no scaling to fit.
  return makeScroller(PRODUKT_SETS.map(produktSetPanel));
}

function fillOverlay(tile) {
  overlayHeading.textContent = tile.innerText.replace(/\s+/g, " ").trim();

  // Per-tile card content
  overlayBody.replaceChildren();
  const key = tile.dataset.overlay;
  const template = key && document.getElementById(`overlay-${key}`);
  if (template) {
    overlayBody.append(template.content.cloneNode(true));
  } else if (key === "viz") {
    overlayBody.append(buildViz());
  } else if (key === "typografie") {
    overlayBody.append(buildTypo());
  } else if (key === "produkt") {
    overlayBody.append(buildProdukt());
  } else if (key === "profilovky") {
    overlayBody.append(buildCarousel(PROFILE_PHOTOS));
  } else if (key === "videa") {
    overlayBody.append(buildVidea());
  }
}

/* Each produkt set must fit its card-height section. Photos are exported to
   fit, so shrinking the masonry's width (height follows the natural aspect)
   scales the whole thing down with no crop. */
function fitMasonries() {
  if (!overlay.open) return;
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
  }
}

function layoutOverlay() {
  requestAnimationFrame(fitMasonries);
}

function openOverlay(tile) {
  sourceTile = tile;
  fillOverlay(tile);
  setFlipNames(tile, true);
  withTransition(() => {
    setFlipNames(tile, false);
    overlay.showModal();
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
    tagline: "Vizuální média &amp; grafický design",
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
    ariaTypoNext: "Další kniha",
    enlarge: "Zvětšit",
    set: "Sada",
    vizCaption: "Popisek",
    galleryTitle: { produkt: "Produkt", profilovky: "Profilovka", videa: "Video" },
    galleryDesc: {
      produkt: "Krátký popis projektu — doplníme.",
      profilovky: "Krátký popis focení — doplníme.",
      videa: "Odkaz na YouTube — doplníme.",
    },
    langButton: "en",
  },
  en: {
    tagline: "Graphic &amp; Visual Media Designer",
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
    ariaTypoNext: "Next book",
    enlarge: "Enlarge",
    set: "Set",
    vizCaption: "Caption",
    galleryTitle: { produkt: "Product", profilovky: "Portrait", videa: "Video" },
    galleryDesc: {
      produkt: "Short project description — coming soon.",
      profilovky: "Short shoot description — coming soon.",
      videa: "YouTube link — coming soon.",
    },
    langButton: "cz",
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
  if (overlay.open && sourceTile) { fillOverlay(sourceTile); layoutOverlay(); } // re-render in the new language
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
