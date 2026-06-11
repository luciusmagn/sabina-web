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

/* --- Tile overlay: flip & expand via the View Transitions API.
   The clicked tile and its label get the same view-transition-names as
   the dialog card and heading, so the browser morphs one into the
   other; CSS adds the flip. Falls back to an instant open/close. --- */

const overlay = document.querySelector(".overlay-card");
const overlayHeading = document.getElementById("overlay-heading");
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
  const label = tile.querySelector("span");
  if (label) label.style.viewTransitionName = on ? "flip-heading" : "";
}

function openOverlay(tile) {
  sourceTile = tile;
  overlayHeading.textContent = tile.innerText.replace(/\s+/g, " ").trim();
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
