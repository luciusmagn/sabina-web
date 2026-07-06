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

- **Hero**: pink flood, paper-white name, BLACK offset text-shadow driven by
  the real sun over Prague (recomputed each minute, `setupSky` in main.js).
  The big orange ball IS the sun — `--ball-x/--ball-y` track real solar
  azimuth/altitude; it sinks below the sheet edge after sunset. Contact pill
  reveals a selectable email on hover; "Kontakt" label anchors to #kontakt.
- **Work ring** (`#prace`): 3D circular carousel, 5 category cards
  (viz / produkt / portréty / videa / typografie). Centre card faces you;
  ±1 flank; ±2 peek deeper, counter-rotated. Wheel rotates it (releases
  after a full loop so the page stays scrollable), arrows/keys/swipe too.
  Labels ride a slow conveyor (drop in from above 1.9s, exit down 0.6s,
  input locked ~2.65s per turn). Clicking the centre card FLIPS it to a
  vertical project deck (snap per project, slim blue scrollbar, 50%-pink
  veil dims everything behind; Esc / click outside closes).
- **Covers**: generated wireframes — Depth-Anything depth maps
  (`static/covers/depth/*.png`, baked by `tools/depth/depth.mjs`) drive
  marching-squares contours + curved verticals, four inks on pink
  (blue/orange/black plates + white silhouette), ink-bleed double strokes,
  per-plate misregistration. Hover = tilt + per-plate parallax
  (`setupCoverParallax`). Videa cover uses a supplied cutout PNG (alpha =
  exact silhouette); the other four use full screenshots — **user intends to
  supply cutouts for those** (transparent PNG, text removed). New cover
  workflow: drop image in `static/covers/`, run
  `node tools/depth/depth.mjs <img> static/covers/depth/<name>.png`.
- **Kontakt**: pink flood, white type + black-shadow bio, icon email/LinkedIn
  lines, orange walker (animated line figure), orange sun at the horizon,
  © line bottom-left.
- Page-wide paper grain overlay; sections snap one-per-viewport
  (`scroll-snap y mandatory`); round translucent cursor (orange); theme
  toggle hidden (riso has one ink set). Reduced-motion is handled throughout.

The riso look is one deletable block at the END of `static/css/style.css`
plus `palette()` in `static/js/main.js`.

## Git state

- Branch `redesign`, ~20 commits ahead of the push point after `pre-riso`.
- **Tags (pushed)**: `ring-v1`, `ring-v2` (photo covers + conveyor labels),
  `pre-riso` (two-theme + depth wireframes — revert point for the whole riso
  experiment). Riso commits are LOCAL ONLY, not yet pushed.
- `master` = old live site. Do not touch without the deploy steps below.

## Open issue #1 — cards may still not open in real browsers (VERIFY FIRST)

Symptom: clicking the centre card does nothing visible in the user's browsers
(any browser). Never reproducible in the harness preview (its compositor
freezes rAF/transitions/pointermove, so hover-parallax never runs there).

History of eliminated suspects: backface hit-testing (pointer-events fixed),
mix-blend-mode duotone inside the 3D faces (replaced with pure CSS filter),
stale cached assets (server now no-cache + `?v=3` busts; user confirmed still
broken after).

**Current fix, applied but NOT yet user-verified** (last commits): the
parallax canvases (`.cover-mesh`) carry inline transforms + `will-change`,
promoting them to compositor layers that escape `backface-visibility`, so the
front face keeps painting over the opened back. Fix in style.css: the
away-facing side gets `visibility: hidden` after a 0.3s delay (half the flip)
— `.rcard.is-flipped .rcard-front, .rcard:not(.is-flipped) .rcard-back` —
plus `.rcard.is-flipped .cover-mesh { transform: none !important }`.

If STILL broken: ask which browser + any console errors; next suspects are
(a) the `.land`/`.leave` animations on `.rcard-label` intercepting the click
target mid-animation, (b) `ctx.filter` unsupported → renderer throw killing
listener wiring (wrap `render()` in try/catch to test), (c) the front's tilt
transform during pointermove retargeting the click. A quick bisect: comment
out `setupCoverParallax()` and test; then `inkStroke` blur.

## Other known follow-ups

- Ring covers: user may want denser/sparser mesh; knobs at top of
  `setupCoverArt` (CELL, LEVELS, AMP, BOW in the verticals, REG offsets,
  inkStroke blur/alpha) and grain opacity in the riso CSS block.
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
