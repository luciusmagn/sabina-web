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

    // the orange disc IS the sun: it travels the hero with the real one
    // (east enters right, west leaves left, altitude lifts it — low near
    // sunrise/sunset, high at noon), and rests half-sunk under the sheet's
    // edge once it has set. Prague's sun tops out near 63°, hence /70; the
    // band tops out at 36% so the disc rides the empty sky above the name.
    if (heroEl) {
      const t = Math.min(1, Math.max(0, (sunP.az - 60) / 240));
      heroEl.style.setProperty("--ball-x", (88 - t * 74).toFixed(1) + "%");
      heroEl.style.setProperty(
        "--ball-y",
        sunP.alt > 0 ? Math.max(4, 32 - (sunP.alt / 70) * 30).toFixed(1) + "%" : "104%"
      );
    }

    if (!body) {
      // both below the horizon — a resting shadow
      root.style.setProperty("--sun-dx", "0.042em");
      root.style.setProperty("--sun-dy", "0.052em");
      root.style.setProperty("--shadow-angle", (Math.atan2(0.052, 0.042) * 180 / Math.PI).toFixed(1) + "deg");
      return;
    }

    const { alt, az } = body;
    const elev = Math.min(alt / 90, 1);

    // Set in em so the offset scales with each element's own type size
    // (magnitudes tuned against ~190px display type).
    const mag = (22 - elev * 14) * (isMoon ? 0.8 : 1);
    const opp = (az + 180) * rad;
    const dxRaw = Math.sin(opp) * mag / 190;
    const dyRaw = Math.max(4, Math.cos(opp) * mag * 0.7 + 8) / 190;
    root.style.setProperty("--sun-dx", dxRaw.toFixed(4) + "em");
    root.style.setProperty("--sun-dy", dyRaw.toFixed(4) + "em");
    // the bearing the shadow is cast along — shared by the name's text-shadow
    // and the orb's own cast shadow so they always agree
    root.style.setProperty("--shadow-angle", (Math.atan2(dyRaw, dxRaw) * 180 / Math.PI).toFixed(1) + "deg");
  }

  sundialApply = apply;
  apply();
  setInterval(apply, 60000);
}
setupSky();

/* ---------------- the sun hover ----------------
   Hovering the sun (the ::before disc) wakes its cast shadow and lengthens
   the name's shadows — the light source leaning in. The disc is a ::before,
   so the hover is a plain circle test on mousemove; the shadows themselves
   are pure CSS off the .sun-hover class. */

function setupSunHover() {
  const hero = document.querySelector(".hero");
  if (!hero || !finePointer.matches) return;

  const sunGeom = () => {
    const hr = hero.getBoundingClientRect();
    return {
      hr,
      x: ((parseFloat(hero.style.getPropertyValue("--ball-x")) || 82) / 100) * hr.width,
      y: ((parseFloat(hero.style.getPropertyValue("--ball-y")) || 8) / 100) * hr.height,
      r: (parseFloat(getComputedStyle(hero, "::before").width) || 0) / 2,
    };
  };

  let hot = false;
  hero.addEventListener("mousemove", (e) => {
    const { hr, x, y, r } = sunGeom();
    const on = Math.hypot(e.clientX - hr.left - x, e.clientY - hr.top - y) <= r + 10;
    if (on !== hot) hero.classList.toggle("sun-hover", on);
    hot = on;
  }, { passive: true });
  hero.addEventListener("mouseleave", () => { hot = false; hero.classList.remove("sun-hover"); });
}
setupSunHover();

/* ---------------- the kontakt sun: flick it and it rolls ----------------
   The footer disc breathes via CSS. Here, swiping the cursor across it
   transfers your swipe speed to the ball, which then ROLLS horizontally —
   far across the field — turning as it goes (rotate = travel / radius) and
   bouncing softly off the screen edges. A gentle, over-damped home spring
   eases it back to its corner afterwards without any wiggle. Only the
   horizontal axis moves (it rolls along the floor). rAF runs while moving. */

function setupKontaktBall() {
  if (reduceMotion.matches || !finePointer.matches) return;
  const kontakt = document.querySelector(".kontakt");
  if (!kontakt) return;

  let px = 0, vx = 0;                    // horizontal displacement + velocity
  let lastX = null, lastMoveT = 0;
  let raf = 0, last = 0;

  const K = 1.3, D = 3.1;   // soft spring, over-damped = a long, slow roll home, no wiggle
  const TRANSFER = 0.5;     // how much of the swipe speed the ball takes on (gentle)
  const CVX_CAP = 3000;     // clamp wild pointer jumps (px/s)
  const MAXV = 1250;        // cap the ball's speed so a flurry of moves can't launch it — slow & smooth

  function geom() {
    const r = kontakt.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const size = Math.max(240, Math.min(460, 0.30 * vw)); // matches clamp(240px,30vw,460px)
    const rad = size / 2;
    return { rad, vw, cx0: r.right - 0.08 * vw - rad, cy: r.bottom + 0.12 * vh - rad };
  }

  function frame(t) {
    raf = 0;
    if (!last) last = t;
    let dt = (t - last) / 1000; last = t;
    if (dt > 0.032) dt = 0.032; // clamp big gaps for a stable integrator

    const g = geom();
    // over-damped home spring: rolls out on a flick, eases back, never wiggles
    vx += (-K * px - D * vx) * dt;
    px += vx * dt;

    // keep it on screen — soft bounce off the left/right edges
    const minPx = g.rad - g.cx0;            // ball's left edge reaches 0
    const maxPx = (g.vw - g.rad) - g.cx0;   // ball's right edge reaches the viewport edge
    if (px < minPx) { px = minPx; vx = Math.abs(vx) * 0.3; }
    if (px > maxPx) { px = maxPx; vx = -Math.abs(vx) * 0.3; }

    kontakt.style.setProperty("--k-dx", px.toFixed(1) + "px");
    kontakt.style.setProperty("--k-rot", (px / g.rad * 57.2958).toFixed(1) + "deg"); // roll without slip

    if (Math.abs(px) > 0.3 || Math.abs(vx) > 2) raf = requestAnimationFrame(frame);
    else { last = 0; kontakt.style.setProperty("--k-dx", "0px"); kontakt.style.setProperty("--k-rot", "0deg"); }
  }

  function kick() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }

  kontakt.addEventListener("pointermove", (e) => {
    const now = performance.now();
    if (lastX !== null) {
      const dtm = Math.max(0.008, (now - lastMoveT) / 1000);
      const cvx = Math.max(-CVX_CAP, Math.min(CVX_CAP, (e.clientX - lastX) / dtm));
      const g = geom();
      const dist = Math.hypot(e.clientX - (g.cx0 + px), e.clientY - g.cy);
      if (dist < g.rad + 40) { // cursor on the ball → flick it, but cap the speed
        vx = Math.max(-MAXV, Math.min(MAXV, vx + cvx * TRANSFER));
        kick();
      }
    }
    lastX = e.clientX; lastMoveT = now;
  }, { passive: true });
  window.addEventListener("resize", kick);
}
setupKontaktBall();

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

/* ---------------- riso covers ----------------
   Each ring cover reprints its source image as a risograph separation:
   three ink plates (orange / blue / black) rendered as CONTINUOUS TONE —
   a fine 2px stochastic grain dither, the way a real riso master screens
   a photo. No visible dot lattice: darks crush toward solid ink, lights
   blow out to the pink paper, and the tone in between reads as subtle
   noise. Each plate sits slightly off-register on its own canvas layer,
   so the hover parallax doubles as live misregistration. Cut-out sources
   (alpha) keep the pink paper around the subject. The source <img> stays
   as the no-JS fallback. */

function setupCoverArt() {
  const covers = [...document.querySelectorAll(".rcard-cover img")];
  if (!covers.length) return;

  const W = 762, H = 540;
  const SW = W, SH = H; // dither at full resolution — 1px grain, no blocks
  const CARD = "#ff87b1";

  // far→near: orange carries the mids, blue the shade, black the depths.
  // ink() maps luminance (0 dark … 1 light) to raw ink demand; CRUSH then
  // squeezes it so heavy areas fuse into SOLID ink and light areas clear
  // to bare paper — grain lives only in the mid-tones, like a real riso
  // screening a photo. The alphas let overlapping solid plates darken each
  // other — poor man's overprint that needs no blend modes (those break
  // the 3D card faces).
  const PLATES = [
    { rgb: [254, 93, 64], alpha: 0.84, ink: (l) => (0.88 - l) * 1.5 }, // orange pulled back — narrower range, lighter
    { rgb: [0, 101, 249], alpha: 0.9, ink: (l) => (0.64 - l) * 2.2 },
    { rgb: [10, 10, 10], alpha: 0.94, ink: (l) => (0.4 - l) * 3.2 },
  ];
  // wider bare-paper cutoff + narrower grain band = less speckle
  const CRUSH = (k) => (k - 0.2) / (0.74 - 0.2); // <0.2 → paper, >0.74 → solid
  const REG = [[1.8, 1.2], [-1.6, 1.0], [1.0, -1.8]]; // px off-register per plate

  // one seeded noise tile shared by every render — stable, no flicker
  const NTILE = 256;
  const NOISE = new Float32Array(NTILE * NTILE);
  for (let y = 0; y < NTILE; y++) {
    for (let x = 0; x < NTILE; x++) {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      NOISE[y * NTILE + x] = s - Math.floor(s);
    }
  }

  const renderers = covers.map((img) => {
    const holder = img.parentElement;
    let layers = null;

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
      if (!img.naturalWidth) return;
      ensureLayers();

      /* --- sample the crop at grain resolution --- */
      const sample = document.createElement("canvas");
      sample.width = SW;
      sample.height = SH;
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
      sctx.drawImage(img, sx, sy, sw, sh, 0, 0, SW, SH);
      const px = sctx.getImageData(0, 0, SW, SH).data;

      /* --- per-image tone, applied to luminance before the crush ---
         exposure is a gamma: <1 lifts shadows (rescues too-dark sources so
         their mids grain up instead of fusing to solid), >1 deepens (gives
         too-pale sources more ink). contrast pivots around mid-grey. Both
         default to 1 (no change). */
      const expo = parseFloat(img.dataset.exposure) || 1;
      const cont = parseFloat(img.dataset.contrast) || 1;
      const N = SW * SH;
      const adj = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let l = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
        if (expo !== 1) l = Math.pow(l, expo);
        if (cont !== 1) l = Math.min(1, Math.max(0, (l - 0.5) * cont + 0.5));
        adj[i] = l;
      }

      /* --- dither each plate into its own layer, off-register --- */
      const ctxs = layers.map((c) => c.getContext("2d"));
      ctxs.forEach((ctx, i) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (i === 0) { ctx.fillStyle = CARD; ctx.fillRect(0, 0, W, H); }
      });

      PLATES.forEach((p, pi) => {
        const plate = sctx.createImageData(SW, SH);
        const out = plate.data;
        const A = Math.round(p.alpha * 255);
        const [pr, pg, pb] = p.rgb;
        const ox = pi * 41, oy = pi * 59; // decorrelate the plates' grain
        for (let y = 0; y < SH; y++) {
          const nrow = ((y + oy) & (NTILE - 1)) * NTILE;
          for (let x = 0; x < SW; x++) {
            const i = (y * SW + x) * 4;
            if (px[i + 3] < 128) continue; // cut-outs keep the pink paper
            const k = CRUSH(p.ink(adj[y * SW + x]));
            if (k <= 0) continue; // highlights clear to bare paper
            const n = NOISE[nrow + ((x + ox) & (NTILE - 1))];
            // solids fuse shut (bar the rare paper fleck); mids grain up
            if (k >= 1 ? n < 0.995 : n < k) {
              out[i] = pr; out[i + 1] = pg; out[i + 2] = pb; out[i + 3] = A;
            }
          }
        }
        // putImageData ignores transforms, so stage the plate and stamp it
        // twice at its misregistration offset: a wide faint pass first (the
        // ink bleeding into the paper fibres), then the softened ink body
        const stage = document.createElement("canvas");
        stage.width = SW;
        stage.height = SH;
        stage.getContext("2d").putImageData(plate, 0, 0);
        const ctx = ctxs[pi];
        ctx.save();
        ctx.filter = "blur(1.4px)";
        ctx.globalAlpha = 0.45;
        ctx.drawImage(stage, REG[pi][0], REG[pi][1], W, H);
        ctx.restore();
        ctx.save();
        ctx.filter = "blur(0.55px)"; // a hair softer so the grain reads quieter
        ctx.drawImage(stage, REG[pi][0], REG[pi][1], W, H);
        ctx.restore();
      });
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
   turn under the cursor (the razorpay hero move, in 2.5D).

   The tilt lives on .rcard-cover, NEVER on .rcard-front: a transform on the
   backface-hidden front (inside the preserve-3d flip) breaks browser hit
   testing — clicks fall through the button onto .rcard-inner and the card
   stops opening. The cover is a flat decorative child, safe to rotate; the
   perspective() in its transform keeps the tilt reading as 3D. */

function setupCoverParallax() {
  if (!finePointer.matches || reduceMotion.matches) return;
  const ring = document.querySelector(".ring");
  if (!ring) return;
  const RATES = [4, 10, 17]; // px of travel per layer, back to front

  ring.querySelectorAll(".rcard").forEach((card) => {
    const cover = card.querySelector(".rcard-cover");
    const inner = card.querySelector(".rcard-inner");
    let raf = 0, nx = 0, ny = 0;

    function apply() {
      raf = 0;
      cover.style.transform = `perspective(1100px) rotateY(${(nx * 3).toFixed(2)}deg) rotateX(${(-ny * 2.2).toFixed(2)}deg)`;
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
  // the marked card (portréty) is centred by default when the section arrives
  let cur = Math.max(0, cards.findIndex((c) => c.classList.contains("rcard--start")));

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

  /* ---- every card opens into a vertical carousel (the ring, but vertical):
     one 16:9 item per view, stepping shows the old card scroll up + shrink +
     fade while the next rises in. Each card keeps its own index. ---- */
  const introTitle = document.querySelector(".albums-intro-title");
  const introText = document.querySelector(".albums-intro-text");
  const decks = new Map();
  cards.forEach((card) => {
    const vp = card.querySelector(".album-viewport");
    if (!vp) return;
    const track = vp.querySelector(".person-track");
    const items = [...track.querySelectorAll(".proj--person")];
    decks.set(card, { vp, track, items, idx: 0, titleEl: card.querySelector(".rcard-title") });
    // re-check fit once each cover's real dimensions are known
    items.forEach((c) => {
      const img = c.querySelector(".person-photo");
      if (img) img.addEventListener("load", () => deckFit(card));
    });
  });

  function deckFit(card) {
    // a cover narrower than the card shows whole (contain) over its own
    // blurred fill; wider ones fill (cover)
    const d = decks.get(card);
    if (!d || !d.vp.clientWidth) return;
    const cardAspect = d.vp.clientWidth / d.vp.clientHeight;
    d.items.forEach((c) => {
      const img = c.querySelector(".person-photo");
      if (img && img.naturalWidth) c.classList.toggle("is-narrow", img.naturalWidth / img.naturalHeight < cardAspect - 0.02);
    });
  }

  function deckLayout(card, animate) {
    const d = decks.get(card);
    if (!d) return;
    const H = d.vp.clientHeight;
    const gap = Math.round(H * 0.16); // veil shows in the gap as a card leaves
    d.items.forEach((c, i) => {
      c.style.height = H + "px";
      c.style.marginBottom = (i === d.items.length - 1 ? 0 : gap) + "px";
      c.classList.toggle("is-active", i === d.idx);
    });
    deckFit(card);
    if (!animate) d.track.style.transition = "none";
    d.track.style.transform = `translateY(${(-d.idx * (H + gap)).toFixed(1)}px)`;
    if (!animate) { void d.track.offsetWidth; d.track.style.transition = ""; }
    // the left column: heading = this card's category, description = the item
    if (introTitle && d.titleEl) {
      introTitle.dataset.cs = d.titleEl.dataset.cs || "";
      introTitle.dataset.en = d.titleEl.dataset.en || "";
      introTitle.textContent = lang === "cs" ? introTitle.dataset.cs : introTitle.dataset.en;
    }
    const active = d.items[d.idx];
    if (introText && active) {
      introText.dataset.cs = active.dataset.roleCs || "";
      introText.dataset.en = active.dataset.roleEn || "";
      introText.textContent = lang === "cs" ? introText.dataset.cs : introText.dataset.en;
      introText.classList.remove("swap");
      void introText.offsetWidth;
      introText.classList.add("swap");
    }
  }

  function deckStep(card, dir) {
    const d = decks.get(card);
    if (!d || !d.items.length) return false;
    const next = Math.max(0, Math.min(d.items.length - 1, d.idx + dir));
    if (next === d.idx) return false;
    d.idx = next;
    deckLayout(card, true);
    return true;
  }

  function flip(card) {
    card.classList.add("is-flipped");
    ring.classList.add("has-flip");
    const d = decks.get(card);
    if (d) {
      d.idx = 0;
      deckLayout(card, false);
      setTimeout(() => deckLayout(card, false), 700); // re-measure once the card has grown
      d.vp.focus({ preventScroll: true });
    }
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
    // the listener sits on the card, not the front face: engines hit-test
    // 3D faces unreliably and a click can land on .rcard-inner instead of
    // the button — from the card, every variant still bubbles here
    card.addEventListener("click", () => {
      if (card.classList.contains("is-flipped")) return; // deck clicks are its own
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
    // an open card steps its carousel with up/down arrows
    if (ring.classList.contains("has-flip")) {
      const card = ring.querySelector(".rcard.is-flipped");
      if (card && e.key === "ArrowDown") { e.preventDefault(); deckStep(card, 1); }
      if (card && e.key === "ArrowUp") { e.preventDefault(); deckStep(card, -1); }
      return;
    }
    const r = ring.getBoundingClientRect();
    const visible = r.top < window.innerHeight * 0.6 && r.bottom > window.innerHeight * 0.4;
    if (!visible) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
  });

  // the mouse wheel rotates the ring too while the section fills the view —
  // vertically (both directions) and horizontally (touchpad side-swipes,
  // which read as browsing the cards). After a full vertical loop in one
  // direction it releases, so the page can always be scrolled past;
  // horizontal never needs to release (the page has nowhere to go sideways).
  // A flipped card keeps native scrolling.
  let wheelLock = 0, runDir = 0, runCount = 0, released = false;
  window.addEventListener("wheel", (e) => {
    if (reduceMotion.matches) return;
    if (ring.classList.contains("has-flip")) {
      // the open card's carousel steps one item per wheel notch, from anywhere
      // on the page (like the ring) — no scroll container involved
      if (e.target.closest(".album-overlay")) return; // the open gallery scrolls native
      e.preventDefault();
      const dY = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      const now = Date.now();
      if (now - wheelLock < 780 || Math.abs(dY) < 8) return; // pace with the slower transition
      wheelLock = now;
      const card = ring.querySelector(".rcard.is-flipped");
      if (card) deckStep(card, dY > 0 ? 1 : -1);
      return;
    }
    const r = ring.getBoundingClientRect();
    const covering = r.top < window.innerHeight * 0.25 && r.bottom > window.innerHeight * 0.75;
    if (!covering) { runCount = 0; released = false; return; }

    const k = e.deltaMode === 1 ? 16 : 1; // Firefox wheels report lines, not px
    const dX = e.deltaX * k, dY = e.deltaY * k;

    // a dominantly sideways swipe turns the ring and never yields the page
    // (preventDefault also stops the browser's back/forward swipe here)
    if (Math.abs(dX) > Math.abs(dY) * 1.2) {
      e.preventDefault();
      const now = Date.now();
      if (now - wheelLock < 450 || Math.abs(dX) < 8) return;
      wheelLock = now;
      go(dX > 0 ? 1 : -1); // fingers travel left → the next card arrives
      return;
    }

    const dir = dY > 0 ? 1 : dY < 0 ? -1 : 0;
    if (!dir) return;
    if (dir !== runDir) { runDir = dir; runCount = 0; released = false; }
    if (released) return; // seen the whole ring — let the page move on
    e.preventDefault();
    const now = Date.now();
    if (now - wheelLock < 450 || Math.abs(dY) < 8) return;
    wheelLock = now;
    if (go(dir)) { // count real turns only — no-ops while a label travels
      runCount += 1;
      if (runCount >= n) released = true;
    }
  }, { passive: false });

  // swipe rotates the ring (horizontal) or steps the open card's carousel (vertical)
  let swipeX = null, swipeY = null;
  stage.addEventListener("pointerdown", (e) => {
    if (ring.classList.contains("has-flip")) swipeY = e.clientY;
    else swipeX = e.clientX;
  });
  window.addEventListener("pointerup", (e) => {
    if (swipeY !== null) {
      const dy = e.clientY - swipeY;
      swipeY = null;
      const card = ring.querySelector(".rcard.is-flipped");
      if (card && Math.abs(dy) > 48) deckStep(card, dy < 0 ? 1 : -1);
      return;
    }
    if (swipeX === null) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
  });

  wide.addEventListener("change", layout);
  window.addEventListener("resize", () => {
    layout();
    const card = ring.querySelector(".rcard.is-flipped");
    if (card) deckLayout(card, false);
  });

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

function openVideoLightbox(src, hd) {
  const video = document.createElement("video");
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  // hd (webm/1080p) first so Chrome/Firefox pick it; the mp4 is the fallback
  // Safari uses when it can't play the webm
  if (hd) {
    const s = document.createElement("source");
    s.src = hd;
    s.type = "video/webm";
    video.append(s);
  }
  const mp4 = document.createElement("source");
  mp4.src = src;
  mp4.type = "video/mp4";
  video.append(mp4);
  lightboxMedia.replaceChildren(video);
  lightbox.showModal();
}

lightbox.addEventListener("click", (event) => {
  if (event.target.tagName !== "VIDEO" && event.target !== lightboxClose) lightbox.close();
});
lightboxClose.addEventListener("click", () => lightbox.close());
lightbox.addEventListener("close", () => lightboxMedia.replaceChildren());

/* ---------------- card actions: play + gallery ----------------
   Each item card's pill either PLAYS a video (data-action="video") or opens
   a GALLERY (data-action="gallery") — a full-screen layer over a solid pink
   field with the item's real photos (masonry) plus, where more is coming,
   transparent-pink placeholder tiles. Photos open in the lightbox (a dialog
   stacking above); Esc walks back down. */

function setupAlbums() {
  const overlay = document.querySelector(".album-overlay");
  if (!overlay) return;
  const grid = overlay.querySelector(".album-grid");
  const title = overlay.querySelector(".album-title");
  const sub = overlay.querySelector(".album-sub");

  // assorted aspect ratios for the transparent-pink "photo coming soon" tiles
  const PH_ASPECTS = ["3 / 4", "16 / 9", "1 / 1", "4 / 5", "9 / 16", "16 / 9", "3 / 2", "1 / 1"];

  function closeAlbum() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    grid.replaceChildren();
  }

  document.querySelectorAll(".person-album-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // videos: the pill just plays the video, no gallery
      if (btn.dataset.action === "video") { openVideoLightbox(btn.dataset.video, btn.dataset.videoHd); return; }

      title.dataset.cs = btn.dataset.titleCs || "";
      title.dataset.en = btn.dataset.titleEn || "";
      title.textContent = lang === "cs" ? title.dataset.cs : title.dataset.en;
      sub.dataset.cs = btn.dataset.noteCs || "";
      sub.dataset.en = btn.dataset.noteEn || "";
      sub.textContent = lang === "cs" ? sub.dataset.cs : sub.dataset.en;

      const items = [];
      // full-bleed images (e.g. the combined iPads) span every column, up top
      (btn.dataset.wide || "").split("|").filter(Boolean).forEach((src) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "album-photo album-photo--wide";
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        b.append(img);
        b.addEventListener("click", () => openLightbox(src));
        items.push(b);
      });
      // the item's real photos, each at its natural dimensions
      (btn.dataset.gallery || "").split("|").filter(Boolean).forEach((src) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "album-photo";
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        b.append(img);
        b.addEventListener("click", () => openLightbox(src));
        items.push(b);
      });
      // where more photos are coming (photos, typography), fill with tiles
      if (btn.dataset.ph) PH_ASPECTS.forEach((ar) => {
        const ph = document.createElement("div");
        ph.className = "album-ph";
        ph.style.aspectRatio = ar;
        ph.setAttribute("aria-hidden", "true");
        items.push(ph);
      });
      grid.replaceChildren(...items);
      overlay.scrollTop = 0;
      overlay.classList.add("is-open");
      overlay.setAttribute("aria-hidden", "false");
    });
  });

  overlay.querySelector(".album-close").addEventListener("click", closeAlbum);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAlbum(); });
  // Esc closes the album (capture + stopPropagation keeps the ring from also
  // closing); but if the lightbox is stacked on top, let it own Esc first
  window.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("is-open")) return;
    if (document.querySelector("dialog[open]")) return; // lightbox on top
    e.stopPropagation();
    if (e.key === "Escape") closeAlbum();
  }, true);
}
setupAlbums();


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
