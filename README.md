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

## Deploy (Cloudflare Pages)

The site is fully static, so no Astro adapter is needed.

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick this repo and the production branch (`main`).
2. Build settings: framework preset **Astro**, build command `npm run build`, output directory `dist`. Node is pinned to 22 by `.node-version`.
3. Custom domains → add `sheltoncyril.io` (and `www.sheltoncyril.io`). If the domain's DNS is already on Cloudflare the records are created for you; otherwise add the CNAME it shows. To send `www` to the apex, add a Redirect Rule (Rules → Redirect Rules).
4. Every push to `main` deploys to production; other branches get preview URLs.

`public/_headers` sets security headers and long-lived caching for `/_astro/*`. To deploy by hand instead of Git integration: `npm run deploy` (needs `npx wrangler login` once).
