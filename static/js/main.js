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

boingTile.addEventListener("click", (event) => {
  boingTile.classList.remove("is-boinging");
  void boingTile.offsetWidth; // restart the animation on rapid clicks
  boingTile.classList.add("is-boinging");

  if (!reduceMotion.matches) {
    let { clientX: x, clientY: y } = event;
    if (!x && !y) { // keyboard activation — pop from the tile's centre
      const r = boingTile.getBoundingClientRect();
      x = r.x + r.width / 2;
      y = r.y + r.height / 2;
    }
    spawnBoingLabel(x, y);
  }
});

boingTile.addEventListener("animationend", () => {
  boingTile.classList.remove("is-boinging");
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

const GALLERY_OVERLAYS = {
  produkt: Array.from({ length: 9 }, (_, i) => ({
    title: `Produkt ${String(i + 1).padStart(2, "0")}`,
    desc: "Krátký popis projektu — doplníme.",
    href: "#",
  })),
  profilovky: Array.from({ length: 9 }, (_, i) => ({
    title: `Profilovka ${String(i + 1).padStart(2, "0")}`,
    desc: "Krátký popis focení — doplníme.",
    href: "#",
  })),
  videa: Array.from({ length: 6 }, (_, i) => ({
    title: `Video ${String(i + 1).padStart(2, "0")}`,
    desc: "Odkaz na YouTube — doplníme.",
    href: "#",
    video: true,
  })),
};

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

  for (const [cls, label, direction] of [
    ["carousel-btn carousel-btn--prev", "Předchozí", -1],
    ["carousel-btn carousel-btn--next", "Další", 1],
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = cls;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = CHEVRON_SVG;
    btn.addEventListener("click", () => {
      const slide = track.firstElementChild;
      if (!slide) return;
      // Aim at an exact snap point — mandatory snap re-targets anything else
      const step = slide.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || "0");
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

function openOverlay(tile) {
  sourceTile = tile;
  overlayHeading.textContent = tile.innerText.replace(/\s+/g, " ").trim();

  // Per-tile card content: a matching <template>, a carousel, or a gallery
  overlayBody.replaceChildren();
  const key = tile.dataset.overlay;
  const template = key && document.getElementById(`overlay-${key}`);
  if (template) {
    overlayBody.append(template.content.cloneNode(true));
  } else if (CAROUSEL_OVERLAYS[key]) {
    overlayBody.append(buildCarousel(CAROUSEL_OVERLAYS[key]));
  } else if (GALLERY_OVERLAYS[key]) {
    overlayBody.append(buildGallery(GALLERY_OVERLAYS[key]));
  }

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
  const r = overlay.getBoundingClientRect();
  const outside =
    event.clientX < r.left || event.clientX > r.right ||
    event.clientY < r.top || event.clientY > r.bottom;
  if (outside) closeOverlay();
});
