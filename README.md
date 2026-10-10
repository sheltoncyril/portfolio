# sheltoncyril.io

Personal portfolio built with [Astro](https://astro.build). Below the hero, the line under my name turns into a git graph: hardware and software projects fork off `main` as two lanes, then merge back at the end.

## Editing content

- `src/data/site.ts` — name, tagline, links (set `email` to show a contact address)
- `src/data/projects.ts` — the projects. `lane` is `hardware` or `software`; set `show: false` to hide one. Images go in `src/assets`.

## How the graph works

`src/scripts/graph.ts` measures the rendered project list and builds one SVG path per segment, then draws each as you scroll (`stroke-dashoffset`). The `<ol>` of projects is the real content; the SVG is decorative and hidden from assistive tech. With `prefers-reduced-motion` the graph is fully drawn. Two layouts: `lanes` (default) and `spurs` (`?layout=spurs`, or the toggle on the page).

## Develop

```sh
npm install
npm run dev      # http://localhost:4321
npm run build
```

## Deploy

GitHub Actions publishes `dist/` to GitHub Pages on every push to `main` (`.github/workflows/deploy.yml`). One-time setup: Settings → Pages → Source: GitHub Actions, custom domain `sheltoncyril.io`, then DNS: four `A` records for the apex (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`) and a `CNAME` for `www` → `sheltoncyril.github.io`.
