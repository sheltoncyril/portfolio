import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/data/site';
import { visibleProjects } from '../../src/data/projects';
import { visibleUpstream } from '../../src/data/upstream';

// Smoke checks on what actually ships: the output of `npm run build` (dist/) and the files Astro copies into
// it untouched (public/). Run with `npm run test:smoke`, after the build. They are not exhaustive; they are
// the things that would be embarrassing to find out from a visitor.

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = join(root, 'dist');
const pub = join(root, 'public');

/** every file under dir, as a path relative to it with forward slashes */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [relative(dir, full).split(sep).join('/')];
  });
}

function page(): string {
  const file = join(dist, 'index.html');
  if (!existsSync(file)) throw new Error('dist/index.html is missing: run `npm run build` first');
  return readFileSync(file, 'utf8');
}
const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

describe('public/', () => {
  // Everything in public/ is served as it is. Throwaway test pages have been dropped in there before.
  it('has no stray HTML (a page belongs in src/pages, and is then built, not copied)', () => {
    const stray = walk(pub).filter((f) => /\.html?$/i.test(f));
    expect(stray, `these would be served from the live site as they are: ${stray.join(', ')}`).toEqual([]);
  });
});

describe('dist/', () => {
  it('has index.html', () => {
    expect(existsSync(join(dist, 'index.html')), 'dist/index.html is missing: run `npm run build` first').toBe(true);
    expect(page().trimStart().toLowerCase().startsWith('<!doctype html>')).toBe(true);
  });

  // The pages are the ones src/pages makes. If you add one, add it here: that is the point of the list.
  it('has no HTML but the pages it should', () => {
    const html = walk(dist).filter((f) => /\.html?$/i.test(f));
    expect(html.sort()).toEqual(['index.html']);
  });

  it('ships the static files the host and crawlers expect', () => {
    for (const f of ['_headers', 'robots.txt', 'sitemap-index.xml', 'favicon.svg', 'og.png']) {
      expect(existsSync(join(dist, f)), `dist/${f}`).toBe(true);
    }
  });
});

describe('index.html', () => {
  it('has the name in the title and as the heading', () => {
    const html = page();
    expect(html).toMatch(new RegExp(`<title>[^<]*${site.name}[^<]*</title>`));
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    expect(h1, 'an <h1>').not.toBeNull();
    expect(text(h1![1])).toBe(site.name);
  });

  it('has JSON-LD that parses and describes the person', () => {
    const html = page();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(blocks).toHaveLength(1);
    const ld = JSON.parse(blocks[0]);
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('Person');
    expect(ld.name).toBe(site.name);
    expect(ld.url).toBe(`https://${site.domain}/`);
    expect(Array.isArray(ld.sameAs)).toBe(true);
    for (const link of ld.sameAs) expect(link).toMatch(/^https:\/\//);
    expect(ld.sameAs).toContain(site.github);
  });

  it('is indexable and says where it lives', () => {
    const html = page();
    expect(html).toContain(`<link rel="canonical" href="https://${site.domain}/">`);
    expect(html).toMatch(/<meta name="description" content="[^"]+">/);
    expect(html, 'a noindex would take the site out of search').not.toMatch(/<meta[^>]+name="robots"[^>]+noindex/i);
  });

  it('has a card for every visible project and upstream project', () => {
    const html = page();
    const cards = [...html.matchAll(/<li class="entry (hw|sw|rh)"/g)].map((m) => m[1]);
    const count = (k: string) => cards.filter((c) => c === k).length;
    expect(count('hw')).toBe(visibleProjects.filter((p) => p.lane === 'hardware').length);
    expect(count('sw')).toBe(visibleProjects.filter((p) => p.lane === 'software').length);
    expect(count('rh')).toBe(visibleUpstream.length);
    for (const p of visibleProjects) expect(html, p.title).toContain(`>${p.title.replace(/&/g, '&amp;')}</h2>`);
  });

  it('the files it links to are all there', () => {
    const html = page();
    const refs = new Set<string>();
    for (const m of html.matchAll(/\s(?:href|src)="(\/[^"#?]*)/g)) refs.add(m[1]);
    for (const m of html.matchAll(/\ssrcset="([^"]+)"/g)) for (const part of m[1].split(',')) refs.add(part.trim().split(/\s+/)[0]);
    refs.delete('/');
    expect(refs.size, 'found no local links to check').toBeGreaterThan(3);
    const missing = [...refs].filter((r) => r.startsWith('/') && !existsSync(join(dist, decodeURIComponent(r.slice(1)))));
    expect(missing).toEqual([]);
  });

  it('the share image it names is shipped', () => {
    const og = /<meta property="og:image" content="([^"]+)"/.exec(page());
    expect(og, 'og:image').not.toBeNull();
    const url = new URL(og![1]);
    expect(url.host).toBe(site.domain);
    expect(existsSync(join(dist, decodeURIComponent(url.pathname.slice(1)))), `dist${url.pathname}`).toBe(true);
  });
});
