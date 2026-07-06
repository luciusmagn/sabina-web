# HANDOFF — sabinamacha.com redesign (branch `redesign`)

Context file for continuing this work in a fresh session. Read this, run the
site, then pick up at **Open issue #1** below.

## What this is

A full redesign of Sabina Mácha's bilingual (cs/en) one-page portfolio, built
on the existing Rust/Rocket + Tera stack. Content stays driven by
`content.json` (the password-gated `/editor` contract is intact). All work
lives on the **`redesign` branch** — `master` is the OLD live site, untouched.

## Run it

```sh
EDITOR_PASSWORD=dev ROCKET_PORT=8000 cargo run    # http://127.0.0.1:8000
```

(Rocket.toml pins 60007 for production; ROCKET_PORT env overrides for dev.
`.claude/launch.json` does this automatically via the preview tools.)
Templates + content.json reload per request in debug; static files are served
from disk; the server sends `Cache-Control: no-cache` on everything, so plain
refresh always gets fresh assets. Rust changes need a rebuild.

## Current design (riso print experiment)

One merged look — risograph two-ink print (was: light/dark themes, see tags):

- **Hero**: pink flood, paper-white name, BLUE offset text-shadow driven by
  the real sun over Prague (recomputed each minute, `setupSky` in main.js).
  A small orange disc IS the sun — `--ball-x/--ball-y` track real solar
  azimuth/altitude (low near sunrise/sunset, high at noon, riding the clear
  sky above the name); it sinks below the sheet edge after sunset. The disc
  breathes (`sun-breathe`, 4.6s scale swell); hovering it prints ONE solid
  blue ray toward the name — the light the blue shadow is cast by
  (`setupSunRays` in main.js; hover = circle test on mousemove, since the
  disc is a ::before). Riso print treatments (kept SUBTLE per user): the
  discs are flat ink with a blue plate 2px off-register (box-shadow); the
  name and kontakt-bio carry an irregular turbulence mask that nibbles
  paper flecks out of the glyphs; the ray overprints (multiply); the
  contact pill has a misregistered blue pass; hero+kontakt carry a faint
  paper-speckle ::after overlay. Contact pill reveals a selectable email
  on hover and sits level with the scroll cue; "Kontakt" label anchors to
  #kontakt.
- **Work ring** (`#prace`): 3D circular carousel, 5 category cards
  (viz / produkt / portréty / videa / typografie). Centre card faces you;
  ±1 flank; ±2 peek deeper, counter-rotated. Wheel rotates it — vertical
  (releases after a full loop so the page stays scrollable) AND horizontal
  touchpad swipes (never release; also suppress the browser's back/forward
  gesture over the section); arrows/keys/pointer-swipe too. Firefox line-
  mode wheel deltas are normalised (×16).
  Labels ride a slow conveyor (drop in from above 1.9s, exit down 0.6s,
  input locked ~2.65s per turn). Clicking the centre card FLIPS it to a
  vertical project deck (snap per project, slim blue scrollbar, 50%-pink
  veil dims everything behind; Esc / click outside closes).
- **Covers**: continuous-tone riso separations (`setupCoverArt` in main.js)
  — each source image reprints as three ink plates (orange/blue/black) via
  a 1px stochastic grain dither with CRUSH: heavy coverage fuses to SOLID
  ink (rare paper flecks), highlights clear to the pink paper, grain lives
  only in the mid-tones — tuned against the user's `inspo*.png` refs in the
  repo root. Per-plate misregistration (REG), plates softened 0.35px, one
  plate per canvas layer so hover parallax = live misregistration. Knobs:
  PLATES ink curves, CRUSH thresholds (0.12 paper / 0.78 solid), REG.
  Cut-out sources keep pink paper via alpha (videa is a cutout; **user
  intends to supply cutouts for the other four**). The depth maps
  (`static/covers/depth/`, `tools/depth/`) are left over from the old
  wireframe covers and are NO LONGER USED. New cover workflow: just drop
  the image in `static/covers/`.
- **Kontakt**: pink flood, white type + blue-shadow bio, icon email/LinkedIn
  lines, orange walker (animated line figure), orange sun at the horizon,
  © line bottom-left. Deck photos show their natural colours (the blue
  duotone filter is gone).
- **Ink edges**: nothing prints razor-sharp — an inline SVG filter pair in
  index.html.tera (`#ink-lg` for display type/discs/ray/card titles,
  `#ink-sm` for small text, pills, chips, the walker) gives every printed
  element noise-displaced wobble, fiber-level edge roughness, and a faint
  dilated bleed halo. The cover canvases stamp each plate twice (wide faint
  pass + softened body) for the same bleed. Tune in the template's filter
  defs (displacement scales, dilate radius, halo slope).
- Page-wide paper grain overlay; sections snap one-per-viewport
  (`scroll-snap y mandatory`); round translucent cursor (orange); theme
  toggle hidden (riso has one ink set). Reduced-motion is handled throughout.

The riso look is one deletable block at the END of `static/css/style.css`
plus the riso cover renderer (`setupCoverArt`) in `static/js/main.js`
(the `pre-riso` tag holds the pre-riso wireframe renderer).

## Git state

- Branch `redesign`, pushed to origin (through the flip fix + riso
  adjustments, 2026-07-06).
- **Tags (pushed)**: `ring-v1`, `ring-v2` (photo covers + conveyor labels),
  `pre-riso` (two-theme + depth wireframes — revert point for the whole riso
  experiment).
- `master` = old live site. Do not touch without the deploy steps below.

## Resolved — cards not opening in real browsers (root cause found)

Symptom was: clicking the centre card does nothing visible in any real
browser; never reproducible in the harness preview.

**Root cause (verified by driving a real Chrome over CDP, headed and
headless):** `setupCoverParallax` wrote its hover tilt as an inline
`rotateY()/rotateX()` transform on **`.rcard-front`** — a backface-hidden
face inside the preserve-3d flip. Any transform there (even a residual
`rotateY(-0.09deg)`) breaks hit-testing of the face: `elementFromPoint` over
the card returns `.rcard-inner`, clicks fall through the button, the click
listener never fires. No pointermove ever runs in the harness preview, so
the front there stays transform-free and clicks always worked; a real user
always crosses the card with the mouse first, so it always failed. All the
compositor/painting theories from earlier rounds were misdiagnoses of this.

**Fix (commit on this branch):**
- the tilt now targets `.rcard-cover` (flat decorative child) with
  `perspective(1100px)` baked into the transform; `.rcard-front` is never
  transformed. Transition moved to `.rcard-cover` in style.css.
- the click listener moved from `.rcard-front` to the `.rcard` itself with
  an `is-flipped` guard, so a stray fall-through click still lands on an
  ancestor that handles it (belt and braces).
- `.rcard.is-flipped .rcard-cover { transform: none !important }` joins the
  mesh reset; asset query strings bumped to `?v=4`.

Verified in real Chrome 149 via CDP: hover→click opens (the exact failing
path), reopen after Esc works, outside-click closes, side-card click
rotates the ring, deck clicks don't re-flip, hit-test grid stays clean
after hovering, no console errors. Screenshots confirmed the riso look and
the open deck render correctly. Not yet user-confirmed in their browsers.

Note: clicking mid-conveyor (~1.3s while the ring is still turning) can hit
a card that is mid-flight and merely re-centre it — pre-existing niggle,
kept as is.

## Other known follow-ups

- Ring covers: user may want coarser/finer halftone; knobs at top of
  `setupCoverArt` (PLATES pitch/angle/alpha + ink curves, REG offsets,
  dropout density in the two hash thresholds) and grain/speckle opacity
  in the riso CSS block.
- Sun ball rests half-sunk (104%) after sunset — user may want it visible.
- Kontakt small white text on pink = low contrast (user accepted so far).
- `static/profilove-fotky/Čert s knihou (1).jpg` untracked, unused.
- Root-level source PNGs/videos are repo bloat (only /target ignored).
- Live server's content.json has uncommitted edits (see DEPLOYMENT.md).

## Deploying (DON'T until asked)

See `DEPLOYMENT.md`. Key traps: server `content.json` has live uncommitted
edits (never reset; commit server-side first); port pinned via Rocket.toml
(60007 behind Caddy); deploy = merge redesign→master, server `git pull`,
rebuild + restart inside `screen -r portfolium`.
