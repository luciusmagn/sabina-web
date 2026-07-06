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
let coverArtApply = () => {};

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
  coverArtApply(); // the mesh covers redraw in the new theme's pair
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

  const ringSection = document.querySelector(".ring");

  window.addEventListener("mousemove", (e) => {
    x = e.clientX; y = e.clientY;
    const overEmail = Boolean(e.target.closest(".hero-contact-email"));
    dot.classList.toggle("cursor--hidden", overEmail); // native caret over the email
    const on = e.target.closest("a, button, [role=button], input, textarea, select, summary");
    dot.classList.toggle("cursor--hover", Boolean(on));
    if (ringSection) {
      const r = ringSection.getBoundingClientRect();
      dot.classList.toggle("cursor--work", e.clientY >= r.top && e.clientY <= r.bottom);
    }
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

  const heroEl = document.querySelector(".hero");

  function apply() {
    const now = new Date();
    const sunP = position(now, sunCoords);
    let body = sunP, isMoon = false;
    if (body.alt <= 0) {
      const moon = position(now, moonCoords);
      if (moon.alt > 0) { body = moon; isMoon = true; }
      else body = null;
    }

    // the orange ball IS the sun: it travels the hero with the real one
    // (east enters right, west leaves left, altitude lifts it), and rests
    // half-sunk under the sheet's edge once it has set
    if (heroEl) {
      const t = Math.min(1, Math.max(0, (sunP.az - 60) / 240));
      heroEl.style.setProperty("--ball-x", (88 - t * 74).toFixed(1) + "%");
      heroEl.style.setProperty(
        "--ball-y",
        sunP.alt > 0 ? Math.max(4, 40 - (sunP.alt / 90) * 36).toFixed(1) + "%" : "104%"
      );
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

/* ---------------- fixed chrome vs sections ----------------
   The lang/theme chips float over every section; they only keep their
   border while the plain middle section is under them. */

function setupChrome() {
  const controls = document.querySelector(".top-controls");
  const ringSection = document.querySelector(".ring");
  if (!controls || !ringSection) return;
  let raf = 0;
  function tick() {
    raf = 0;
    const r = ringSection.getBoundingClientRect();
    const y = 40; // the chips' line
    controls.classList.toggle("plain", !(r.top <= y && r.bottom >= y));
  }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  tick();
}
setupChrome();

/* ---------------- wireframe covers ----------------
   Each ring cover is redrawn as a form-following wireframe: the image's
   luminance becomes a smooth height field, and iso-contour lines (plus a
   sparse warped vertical family and the silhouette) wrap around the subject
   like a 3D mesh. Strokes are split across three depth layers so the
   subject can parallax under the cursor. Flat ground, thin lines, no
   gradients — pink + blue in light, orange + black in dark. The source
   <img> stays as the no-JS fallback. */

function setupCoverArt() {
  const covers = [...document.querySelectorAll(".rcard-cover img")];
  if (!covers.length) return;

  const CELL = 6;                          // lattice pitch in canvas px
  const W = 762;
  const COLS = Math.floor(W / CELL) + 1;   // sample points, not cells
  const ROWS = 91;
  const H = (ROWS - 1) * CELL;
  const LEVELS = Array.from({ length: 12 }, (_, i) => 0.07 + i * 0.078);
  const AMP = 26;                          // vertical-line warp

  // riso experiment: pink flood, one ink per depth plate (far→near:
  // blue, orange, black) and a paper-white silhouette knockout
  const palette = () => ({
    bg: "#ff87b1",
    inks: ["#0065f9", "#fe5d40", "#000000"],
    sil: "#fbf8f1",
  });

  const renderers = covers.map((img) => {
    const holder = img.parentElement;
    let layers = null;

    // optional baked depth map (white = near); rendering waits for it
    let depthImg = null, depthReady = true;
    if (img.dataset.depth) {
      depthReady = false;
      depthImg = new Image();
      depthImg.onload = () => { depthReady = true; render(); };
      depthImg.onerror = () => { depthImg = null; depthReady = true; render(); };
      depthImg.src = img.dataset.depth;
    }

    function ensureLayers() {
      if (layers) return;
      layers = [0, 1, 2].map((i) => {
        const c = document.createElement("canvas");
        c.className = "cover-mesh cover-mesh--l" + i;
        c.width = W;
        c.height = H;
        c.setAttribute("aria-hidden", "true");
        holder.append(c);
        return c;
      });
      holder.classList.add("has-mesh");
    }

    function render() {
      if (!img.naturalWidth || !depthReady) return;
      ensureLayers();

      /* --- sample luminance + alpha on the lattice --- */
      const sample = document.createElement("canvas");
      sample.width = COLS;
      sample.height = ROWS;
      const sctx = sample.getContext("2d", { willReadFrequently: true });
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
      if (img.dataset.crop) {
        const [cx, cy, cw, ch] = img.dataset.crop.split(",").map(Number);
        sx = (cx / 100) * img.naturalWidth;
        sy = (cy / 100) * img.naturalHeight;
        sw = (cw / 100) * img.naturalWidth;
        sh = (ch / 100) * img.naturalHeight;
      } else {
        const targetRatio = W / H;
        const srcRatio = sw / sh;
        if (srcRatio > targetRatio) { sw = sh * targetRatio; sx = (img.naturalWidth - sw) / 2; }
        else { sh = sw / targetRatio; sy = (img.naturalHeight - sh) / 2; }
      }
      sctx.drawImage(img, sx, sy, sw, sh, 0, 0, COLS, ROWS);
      const px = sctx.getImageData(0, 0, COLS, ROWS).data;
      const N = COLS * ROWS;
      const lum = new Float32Array(N);
      const alpha = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
        alpha[i] = px[i * 4 + 3] / 255;
      }

      /* --- the height field: true depth when a map is baked, else luminance.
         The depth map was generated from the source at the same aspect, so
         the same crop rectangle applies (scaled to its own pixel size). */
      let field;
      if (depthImg) {
        const kx = depthImg.naturalWidth / img.naturalWidth;
        const ky = depthImg.naturalHeight / img.naturalHeight;
        sctx.drawImage(depthImg, sx * kx, sy * ky, sw * kx, sh * ky, 0, 0, COLS, ROWS);
        const dp = sctx.getImageData(0, 0, COLS, ROWS).data;
        field = new Float32Array(N);
        // mostly true depth (macro form), a dash of luminance (surface detail)
        for (let i = 0; i < N; i++) field[i] = 0.78 * (dp[i * 4] / 255) + 0.22 * lum[i];
      } else {
        field = Float32Array.from(lum);
      }

      /* --- the subject mask ---
         Cut-out sources (transparent background) give it directly; opaque
         photos fall back to "differs from the border tone or sits on an
         edge", closed with one dilation. */
      const at = (arr, c, r) =>
        arr[Math.max(0, Math.min(ROWS - 1, r)) * COLS + Math.max(0, Math.min(COLS - 1, c))];
      let mask = new Float32Array(N);
      const transparent = alpha.some((a) => a < 0.5);
      if (transparent) {
        for (let i = 0; i < N; i++) mask[i] = alpha[i] > 0.5 ? 1 : 0;
      } else {
        const border = [];
        for (let c = 0; c < COLS; c++) border.push(lum[c], lum[(ROWS - 1) * COLS + c]);
        for (let r = 0; r < ROWS; r++) border.push(lum[r * COLS], lum[r * COLS + COLS - 1]);
        border.sort();
        const bgLum = border[Math.floor(border.length / 2)];
        const raw = new Uint8Array(N);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const v = at(lum, c, r);
          const grad = Math.max(
            Math.abs(v - at(lum, c + 1, r)), Math.abs(v - at(lum, c - 1, r)),
            Math.abs(v - at(lum, c, r + 1)), Math.abs(v - at(lum, c, r - 1))
          );
          raw[r * COLS + c] = (Math.abs(v - bgLum) > 0.14 || grad > 0.075) ? 1 : 0;
        }
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          mask[r * COLS + c] =
            at(raw, c, r) || at(raw, c - 1, r) || at(raw, c + 1, r) || at(raw, c, r - 1) || at(raw, c, r + 1) ? 1 : 0;
        }
      }

      /* --- smooth the height field so contours follow FORM, not noise --- */
      const blurPasses = depthImg ? 1 : 2; // real depth is already smooth
      for (let pass = 0; pass < blurPasses; pass++) {
        const out = new Float32Array(N);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          let s = 0, w = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (at(mask, c + dc, r + dr)) { s += at(field, c + dc, r + dr); w++; }
          }
          out[r * COLS + c] = w ? s / w : at(field, c, r);
        }
        field = out;
      }

      // spread the LEVELS across the subject's own range instead of
      // stretching the field — stretching amplifies invisible vignettes
      // into level-crossing ramps (long straight artifact lines)
      let lo = 1, hi = 0;
      for (let i = 0; i < N; i++) if (mask[i]) { if (field[i] < lo) lo = field[i]; if (field[i] > hi) hi = field[i]; }
      const span = Math.max(0.1, hi - lo);
      const tOf = (v) => (v - lo) / span;

      /* --- draw: layer 0 = ground + low contours, 1 = mid, 2 = high + edge --- */
      const { bg, inks, sil } = palette();
      // each plate sits a hair off-register, like a real riso pass
      const REG = [[0.9, 0.7], [-0.8, 0.5], [0.5, -0.9]];
      const ctxs = layers.map((c) => c.getContext("2d"));
      ctxs.forEach((ctx, i) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (i === 0) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
        ctx.translate(REG[i][0], REG[i][1]);
        ctx.strokeStyle = inks[i];
        ctx.lineWidth = 1.25;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
      });
      const bandFor = (t) => (t < 0.34 ? 0 : t < 0.68 ? 1 : 2);

      // marching squares over a field: draws the iso-line f=level
      function iso(f, level, ctx, gated) {
        for (let r = 0; r < ROWS - 1; r++) {
          for (let c = 0; c < COLS - 1; c++) {
            const v0 = at(f, c, r), v1 = at(f, c + 1, r);
            const v2 = at(f, c + 1, r + 1), v3 = at(f, c, r + 1);
            if (gated) {
              if (!(at(mask, c, r) && at(mask, c + 1, r) && at(mask, c + 1, r + 1) && at(mask, c, r + 1))) continue;
              // near-flat ramps cross levels in long straight chains — skip them
              if (Math.max(v0, v1, v2, v3) - Math.min(v0, v1, v2, v3) < 0.02) continue;
            }
            let idx = 0;
            if (v0 > level) idx |= 1;
            if (v1 > level) idx |= 2;
            if (v2 > level) idx |= 4;
            if (v3 > level) idx |= 8;
            if (idx === 0 || idx === 15) continue;
            const x = c * CELL, y = r * CELL;
            // clamped lerp — equal corners would otherwise explode the
            // division and shoot a line across the whole canvas
            const t = (a, b) => Math.max(0, Math.min(1, (level - a) / ((b - a) || 1)));
            const top    = [x + CELL * t(v0, v1), y];
            const right  = [x + CELL, y + CELL * t(v1, v2)];
            const bottom = [x + CELL * t(v3, v2), y + CELL];
            const left   = [x, y + CELL * t(v0, v3)];
            const SEGS = {
              1: [left, top], 2: [top, right], 3: [left, right], 4: [right, bottom],
              5: [left, top, right, bottom], 6: [top, bottom], 7: [left, bottom],
              8: [bottom, left], 9: [top, bottom], 10: [top, right, bottom, left],
              11: [right, bottom], 12: [right, left], 13: [top, right], 14: [left, top],
            }[idx];
            for (let s = 0; s < SEGS.length; s += 2) {
              ctx.moveTo(SEGS[s][0], SEGS[s][1]);
              ctx.lineTo(SEGS[s + 1][0], SEGS[s + 1][1]);
            }
          }
        }
      }

      // contour levels sit at QUANTILES of the subject's field values, so
      // the mesh wraps evenly however the depth happens to be distributed
      const vals = [];
      for (let i = 0; i < N; i++) if (mask[i]) vals.push(field[i]);
      vals.sort();
      const qLevel = (q) => vals[Math.min(vals.length - 1, Math.floor(q * vals.length))] || 0;
      LEVELS.forEach((q) => iso(field, qLevel(q), ctxs[bandFor(q)], true));

      // the vertical family ties the contours into a mesh. Instead of
      // dropping straight down, each line bows around the forms — pushed
      // sideways off the field's horizontal gradient, like longitude lines
      // wrapping a bulge. (A run also restarts whenever it hops to another
      // depth layer — continuing a path on a different canvas would drag a
      // stray line from wherever that layer's path last ended.)
      const gx = new Float32Array(N);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (at(mask, c, r)) gx[r * COLS + c] = (at(field, c + 1, r) - at(field, c - 1, r)) / 2;
      }
      const BOW = 130, MAXBOW = CELL * 2.2;
      for (let c = 0; c < COLS; c += 3) {
        let run = false, lastBand = -1;
        for (let r = 0; r < ROWS; r++) {
          if (at(mask, c, r)) {
            const t = tOf(at(field, c, r));
            const band = bandFor(t);
            const bow = Math.max(-MAXBOW, Math.min(MAXBOW, -at(gx, c, r) * BOW));
            const px2 = c * CELL + bow, py = r * CELL - t * AMP + AMP / 2;
            if (!run || band !== lastBand) { ctxs[band].moveTo(px2, py); run = true; lastBand = band; }
            else ctxs[band].lineTo(px2, py);
          } else run = false;
        }
      }

      // printy ink: a soft bleed pass under a near-crisp pass
      const inkStroke = (ctx) => {
        ctx.save();
        ctx.filter = "blur(1.1px)";
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.filter = "blur(0.3px)";
        ctx.stroke();
        ctx.restore();
      };
      ctxs.forEach(inkStroke);

      // the silhouette knocks out in paper white on the nearest plate
      const c2 = ctxs[2];
      c2.beginPath();
      iso(mask, 0.5, c2, false);
      c2.strokeStyle = sil;
      c2.lineWidth = 2.1;
      inkStroke(c2);
    }

    if (img.complete) render();
    else img.addEventListener("load", render, { once: true });
    return render;
  });

  coverArtApply = () => renderers.forEach((r) => r());
}
setupCoverArt();

/* ---------------- hover look-around ----------------
   Moving the mouse over the centre card tilts it a touch and shifts the
   wireframe's depth layers at different rates — the subject appears to
   turn under the cursor (the razorpay hero move, in 2.5D). */

function setupCoverParallax() {
  if (!finePointer.matches || reduceMotion.matches) return;
  const ring = document.querySelector(".ring");
  if (!ring) return;
  const RATES = [4, 10, 17]; // px of travel per layer, back to front

  ring.querySelectorAll(".rcard").forEach((card) => {
    const front = card.querySelector(".rcard-front");
    const inner = card.querySelector(".rcard-inner");
    let raf = 0, nx = 0, ny = 0;

    function apply() {
      raf = 0;
      front.style.transform = `rotateY(${(nx * 3).toFixed(2)}deg) rotateX(${(-ny * 2.2).toFixed(2)}deg)`;
      card.querySelectorAll(".cover-mesh").forEach((c, i) => {
        c.style.transform = `translate(${(-nx * RATES[i]).toFixed(1)}px, ${(-ny * RATES[i] * 0.6).toFixed(1)}px)`;
      });
    }

    inner.addEventListener("pointermove", (e) => {
      if (!card.classList.contains("is-center") || card.classList.contains("is-flipped")) return;
      const r = inner.getBoundingClientRect();
      nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(apply);
    });

    inner.addEventListener("pointerleave", () => {
      nx = 0; ny = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    });
  });
}
setupCoverParallax();

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
    front.classList.remove("land", "settle");
    void front.offsetWidth; // restart the animation
    front.classList.add("land");
  }

  function layout() {
    // a deep ring: ±1 flanks the centre with a gap, ±2 peeks in that gap
    // from further back (larger x than the centre, smaller than ±1, pushed
    // away on Z). Positive rotation = outer edges recede, like a big ball
    // behind pushing the cards out.
    const X    = wide.matches ? [0, 54, 40]   : [0, 84, 60];   // vw from centre
    const RY   = wide.matches ? [0, 32, 52]   : [0, 24, 46];   // deg
    const Z    = [0, -170, -430];                              // px into the screen
    const SC   = [1, 0.88, 0.74];
    cards.forEach((card, i) => {
      let off = (i - cur + n) % n;
      if (off > n / 2) off -= n;
      const a = Math.min(Math.abs(off), 2);
      const sign = Math.sign(off);
      // the deep pair counter-rotates — they're on the far side of the
      // circle wrapping back around, so the ring reads round from the front
      const spin = a === 2 ? -1 : 1;
      card.style.setProperty("--tx", (sign * X[a]) + "vw");
      card.style.setProperty("--ry", (sign * spin * RY[a]) + "deg");
      card.style.setProperty("--tz", Z[a] + "px");
      card.style.setProperty("--sc", String(SC[a]));
      card.style.zIndex = String(10 - a);
      card.classList.toggle("is-center", off === 0);
      card.querySelector(".rcard-front").tabIndex = off === 0 ? 0 : -1;
      card.setAttribute("aria-hidden", off === 0 ? "false" : "true");
    });
  }

  let busy = false; // one full sequence at a time

  function go(dir) {
    if (busy || ring.classList.contains("has-flip")) return false;
    busy = true;

    if (reduceMotion.matches) {
      cur = (cur + dir + n) % n;
      layout();
      land();
      setTimeout(() => { busy = false; }, 60);
      return true;
    }

    // 1 · the outgoing label travels down and disappears completely…
    const old = cards[cur].querySelector(".rcard-front");
    old.classList.remove("land", "settle");
    old.classList.add("leave");

    // 2 · …only then does the ring turn and the next label drop in
    setTimeout(() => {
      cur = (cur + dir + n) % n;
      layout();
      land();
      // the old card is a side card by now — fade its resting label back
      setTimeout(() => {
        old.classList.remove("leave");
        old.classList.add("settle");
        setTimeout(() => old.classList.remove("settle"), 600);
      }, 650);
    }, 630);

    setTimeout(() => { busy = false; }, 2650);
    return true;
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
    if (ring.classList.contains("has-flip")) {
      // the open deck scrolls natively; anywhere else the page must hold still
      if (!e.target.closest(".rback-scroll")) e.preventDefault();
      return;
    }
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
    if (go(dir)) { // count real turns only — no-ops while a label travels
      runCount += 1;
      if (runCount >= n) released = true;
    }
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
