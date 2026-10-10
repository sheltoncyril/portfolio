# sheltoncyril.io

Personal portfolio built with [Astro](https://astro.build). A line runs right under the name from the start; as you scroll it pulls in to a trunk and a git graph slides in from the right: hardware and software projects fork off `main` as two lanes, then merge back at the end. An 8-bit dog peeks over the name, drops onto the line when you start scrolling, wanders along it leaving paw prints, and hops from card to card to stay in the window as you scroll.

## Editing content

- `src/data/site.ts` — name, tagline, links (set `email` to show a contact address)
- `src/data/projects.ts` — the projects. `lane` is `hardware` or `software`; set `show: false` to hide one. Images go in `src/assets`.

## How the graph works

`src/scripts/graph.ts` measures the rendered project list and builds one SVG path per segment, then draws each as you scroll (`stroke-dashoffset`). The whole SVG waits one screen-width to the right and is translated into place over the same first stretch of scroll that docks the name; the hero line starts one screen-width to the left of the tree, so at scroll 0 it spans the screen and then shortens to the trunk as the tree arrives. The `<ol>` of projects is the real content; the SVG is decorative and hidden from assistive tech. With `prefers-reduced-motion` the graph is fully drawn. Two layouts: `lanes` (default) and `spurs` (`?layout=spurs`, or the toggle on the page).

## The dog

Self-contained decoration (aria-hidden, no pointer events of its own). `graph.ts` measures the name, the hero line and the project cards and hands the dog a small `PupWorld` (`layout()`, on every rebuild) plus the scroll state (`sync()`, on every paint).

- `src/scripts/pup-art.ts` is the pixel art: a side-on body (`POSES`), a front-on face and a paw print, composed from rectangles and auto-outlined
- `src/scripts/pup.ts` is the behaviour: a small state machine (`peek` → `drop` → `land` → `idle` ⇄ `walk` / `sniff` / `sleep` / `teeter`, plus `leap` between platforms and `leave` / `away` when there is nowhere to stand) on its own `requestAnimationFrame` loop, which parks itself when the dog is off screen or the tab is hidden
- it starts as a face looking out from behind the last letter of the name. `graph.ts` finds that letter's right-hand edge by drawing it on a canvas in the name's font, so the face is cut along the letter whatever the font
- it follows the cursor (or the last tap), running when the cursor is a way off, sits and looks at you if you hover close, naps when nothing happens for a few seconds, and barks if you click it
- at the end of the line (or the edge of the screen, or a card) it skids, teeters with its paws scrabbling, hops back and stays a few steps clear for a while
- it stands on "platforms": index 0 is the hero line, then the cards top to bottom (`PupWorld.cards`: each card's layout box and its `.entry`, so the dog can tell whether the card is revealed, i.e. has the class `in`). Paw prints are stamped on whatever it stands on and go when that card is put away
- it hops between platforms to stay in the window: once its feet get up to the top bar (or, scrolling up, down to the bottom of the window, or its card has faded away under it) it flies in a ballistic arc (`run0` rising, `fall` coming down; the arc is in tree coordinates, so scrolling doesn't bend it) to a revealed card, landing in the middle 40% of it. It aims where the card will be by the time it lands, using the scroll speed, so it doesn't land on a card that has already gone; in a fast scroll it waits and drops in from above (or leaps in from below) once the page settles. Cards are only revealed after the tree has slid in, so on the way down the dog is out of sight for a moment before it first drops onto a card. Consecutive hops go to the next card in the list, so they only cross the trunk where the cards change sides
- on a phone the line shrinks to a stub: the dog hops to the first card if there is one to land on, and only runs out of the left edge (`leave` / `away`) when there is not
- a short pause after each landing stops it chain-hopping; `LEAP_COOLDOWN`, `TOP_EDGE`, `BOTTOM_EDGE`, `LEAP_RISE`, `LEAP_G` at the top of `pup.ts` tune it

The name's typeface can be tried out with `?font=instrument | dm | gloock | young` (with `?fonts` a small picker appears); the default is Instrument Serif. The size is divided by `--name-k`, how wide each face sets relative to Instrument Serif, so the name takes the same width in all of them.
- paw prints come from a small pool and fade by distance walked, not by time
- with `prefers-reduced-motion` it just sits on the line and never jumps

To add behaviour, add a state next to the existing ones and have `step()` react to it.

## Develop

```sh
npm install
npm run dev      # http://localhost:4321
npm run build
```

## Deploy (Cloudflare Pages)

Static site, no adapter needed. In Cloudflare Pages: build command `npm run build`, output directory `dist`. Node 22 is pinned by `.node-version`. `public/_headers` sets security headers and long-lived caching for `/_astro/*`.
