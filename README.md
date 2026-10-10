# sheltoncyril.io

Personal portfolio built with [Astro](https://astro.build). A line runs under the intro from the start; as you scroll it pulls in to a trunk and a git graph slides in from the right: hardware and software projects fork off `main` as two lanes, then merge back at the end.

## Editing content

- `src/data/site.ts` — name, tagline, links (set `email` to show a contact address)
- `src/data/projects.ts` — the projects. `lane` is `hardware` or `software`; set `show: false` to hide one. Images go in `src/assets`.

## How the graph works

`src/scripts/graph.ts` measures the rendered project list and builds one SVG path per segment, then draws each as you scroll (`stroke-dashoffset`). The whole SVG waits one screen-width to the right and is translated into place over the same first stretch of scroll that docks the name; the hero line starts one screen-width to the left of the tree, so at scroll 0 it spans the screen and then shortens to the trunk as the tree arrives. The `<ol>` of projects is the real content; the SVG is decorative and hidden from assistive tech. With `prefers-reduced-motion` the graph is fully drawn. Two layouts: `lanes` (default) and `spurs` (`?layout=spurs`, or the toggle on the page).

## Develop

```sh
npm install
npm run dev      # http://localhost:4321
npm run build
```

## Deploy (Cloudflare Pages)

Static site, no adapter needed. In Cloudflare Pages: build command `npm run build`, output directory `dist`. Node 22 is pinned by `.node-version`. `public/_headers` sets security headers and long-lived caching for `/_astro/*`.
