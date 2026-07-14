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
  disc is a ::before). NB: hero + kontakt were reverted to their v8
  (`85b4d7f`) look on user request — combined colours + the sun, but NO
  riso print treatment (no halftone/ink-bleed/dropout/speckle; the riso
  effect is kept for the ring card covers only). The page-wide `body::after`
  paper grain still lies over everything (it predates v8). Contact pill
  reveals a selectable email on hover and sits level with the scroll cue;
  "Kontakt" label anchors to #kontakt.
- **Work ring** (`#prace`): 3D circular carousel, 5 category cards
  (viz / produkt / portréty / videa / typografie). Centre card faces you;
  ±1 flank; ±2 peek deeper, counter-rotated. Wheel rotates it — vertical
  (releases after a full loop so the page stays scrollable) AND horizontal
  touchpad swipes (never release; also suppress the browser's back/forward
  gesture over the section); arrows/keys/pointer-swipe too. Firefox line-
  mode wheel deltas are normalised (×16).
  Labels ride a slow conveyor (drop in from above 1.9s, exit down 0.6s,
  input locked ~2.65s per turn). Clicking the centre card FLIPS it to a
  vertical project deck (snap per page, slim blue scrollbar whose track
  is inset `margin-block: var(--radius)` so the thumb clears the card's
  rounded corners, 50%-pink veil dims everything behind; Esc / click outside
  closes). NB headless Chrome doesn't paint custom scrollbars, so verify the
  scrollbar visually in a real browser.
  Deck page types (all data from content.json, template-side layout only):
  `.proj--set` = grouped pages (viz: Krulichovi brand page + devices page;
  produkt: one page per productSet) with the set's label + caption up top
  and photos in rows (widths ∝ `--ar` aspect, from content.json where
  available) or a 2-col grid; `--contain` rows never crop (used for the viz
  collages + devices). `.proj--kniha` books are padded smaller with
  air above/below; captions read "Title, Author · /activity/".
  **Portréty = the ALBUMS CARD** (`.rcard--albums`, modelled on
  pixel.melbourne/directors): opening it slides the card right
  (`--tx !important` outbids layout()'s inline var; width grows to 56vw)
  over a deep veil (0.93; the ring stays faintly visible behind). Floating
  text on the left (`.ring-albums-intro`): flat BLUE heading (no shadow
  plate) + PAPER description that FOLLOWS the tile in view
  (`setupAlbumsIntro` reads each tile's `data-role-*`; pink body text was
  tried and is ILLEGIBLE on the pink veil). Each person is their own
  free-floating TILE (`.proj--person`, gap between tiles, the card's own
  back transparent) — the whole tile scrolls away as the next arrives with
  the veil showing through the gap (per user, matching the reference; a
  sticky cover/stacking variant was tried and rejected), scrollbar hidden
  for this deck; full-bleed photo (object-position 50% 18% keeps faces),
  BLUE name bottom-left (only the name — the role lives in the left text),
  paper pill bottom-right. The pill opens `.album-overlay` — a full-screen
  <dialog> (Esc/top-layer free; lightbox stacks above it) with that
  person's photo grid from `photos[].album` in content.json. `album` is
  OPTIONAL (guarded `is defined`) — the server's live content.json renders
  fine without it, but album buttons only appear once it gains `album`
  arrays (add via /editor, never git-reset). `profilePhotos.intro` is
  currently unused. Mobile <900px: no side text, card stays centred.
  All nav arrows (hero scroll cue, ring prev/next, ring up/down jumps) are
  plain straight arrows in index.html.tera — swapped from the earlier
  hand-drawn curvy paths.
- **Covers**: continuous-tone riso separations (`setupCoverArt` in main.js)
  — each source image reprints as three ink plates (orange/blue/black) via
  a 1px stochastic grain dither with CRUSH: heavy coverage fuses to SOLID
  ink (rare paper flecks), highlights clear to the pink paper, grain lives
  only in the mid-tones — tuned against the user's `inspo*.png` refs in the
  repo root. Per-plate misregistration (REG), plates softened 0.35px, one
  plate per canvas layer so hover parallax = live misregistration. Knobs:
  PLATES ink curves, CRUSH thresholds (0.2 paper / 0.74 solid — widened to
  quiet the grain and let more pink paper show), REG. Orange plate is
  deliberately pulled back (alpha 0.84, range l<0.88) so blue/black carry
  more and the set reads less orange; body stamp blur 0.55px softens grain.
  Source images are the 2026-07 set (`static/covers/{viz,produkt,portrety,
  videa,typografie}.jpg`, resized ≤1100px; originals with spaces sit
  untracked in the repo root). Per-image tone can be nudged in the template
  via `data-exposure` (gamma: <1 lifts shadows for too-dark sources, >1
  deepens too-pale ones) and `data-contrast` — currently videa
  (0.6/1.08, was near-black) and typografie (1.32/1.32 — deepened extra to
  hold presence now that orange is pulled back).
  `data-crop="cx,cy,cw,ch"` (percent) still works but must be ~1.41:1 or it
  stretches; none of the current covers use it (auto center-crop). The
  depth maps (`static/covers/depth/`, `tools/depth/`) are left over from the
  old wireframe covers and are NO LONGER USED. New cover workflow: drop the
  image in `static/covers/`, point the card's `<img src>` at it, tune
  data-exposure/contrast if it lands too dark or pale.
- **Kontakt**: pink flood, white type + blue-shadow bio, icon email/LinkedIn
  lines, orange sun at the horizon, © line bottom-left. Deck photos show
  their natural colours (the blue duotone filter is gone). The horizon sun
  breathes (CSS `kontakt-breathe` scale keyframes) and ROLLS when you swipe
  it — `setupKontaktBall` in main.js transfers the cursor's swipe speed
  (TRANSFER) to the disc, which rolls horizontally across the field
  (`--k-dx`), turning as it goes (`--k-rot` = travel / radius) and bouncing
  softly off the screen edges, then an over-damped home spring (K/D) eases
  it back with no wiggle. The ball's speed is capped (MAXV) so a flurry of
  pointermove events can't accumulate into a launch — keeps the roll slow &
  smooth (that was the fix for "too fast"). Only the horizontal axis moves;
  the disc is flat orange (no sunspots — the big travel reads as the roll).
  rAF only runs while it's moving.
  The **walker** (animated line figure) is hidden via `.walker-track {
  display: none }` in the riso CSS block but KEPT in the index template —
  delete that one rule to bring him back.
- **Ink edges**: the DOM-wide ink-bleed SVG filters (`#ink-lg`/`#ink-sm`)
  were REMOVED with the hero/kontakt revert — page type and shapes print
  crisp again. The soft-ink/bleed character survives only on the covers:
  `setupCoverArt` stamps each plate twice (wide faint pass + softened body)
  in-canvas. If a printed-edge look is ever wanted site-wide again, the
  filter defs live in git at tag/commit `854b831`.
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
