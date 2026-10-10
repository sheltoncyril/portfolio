import { describe, expect, it } from 'vitest';
import { projects, visibleProjects } from './projects';
import { site } from './site';
import { upstream, upstreamProjects, visibleUpstream } from './upstream';

// What these catch: a typo in a lane or a date, a copy-pasted id, a card with no summary. None of them is a
// type error that `astro check` would see, and each ends up on the live page (or in its ordering).

/** YYYY-MM-DD that is a real calendar day (not 2026-02-30). */
function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10); // a day's slack for time zones
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/; // lowercase words joined by hyphens: ends up in the card's ref (hw/<id>)
const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

interface Entry {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  started: string;
  show?: boolean;
}
// the checks the two lists have in common
function describeEntries(name: string, list: Entry[], visible: Entry[]) {
  describe(name, () => {
    it('has some', () => {
      expect(list.length).toBeGreaterThan(0);
      expect(visible.length).toBeGreaterThan(0);
    });

    it('every entry has an id, a title and a summary', () => {
      for (const p of list) {
        for (const key of ['id', 'title', 'summary'] as const) {
          expect(typeof p[key], `${p.id ?? p.title}: ${key}`).toBe('string');
          expect(p[key].trim(), `${p.id ?? p.title}: ${key} is empty`).not.toBe('');
        }
      }
    });

    it('ids are unique, lowercase words joined by hyphens', () => {
      const ids = list.map((p) => p.id);
      expect(dupes(ids), 'duplicated ids').toEqual([]);
      for (const id of ids) expect(id).toMatch(ID);
    });

    it('started is a real YYYY-MM-DD date, not in the future', () => {
      for (const p of list) {
        expect(isIsoDate(p.started), `${p.id}: started "${p.started}"`).toBe(true);
        expect(p.started <= tomorrow(), `${p.id}: started ${p.started} is in the future`).toBe(true);
      }
    });

    it('every entry has at least one tag, none of them blank or repeated', () => {
      for (const p of list) {
        expect(p.tags.length, `${p.id}: tags`).toBeGreaterThan(0);
        for (const t of p.tags) expect(t.trim(), `${p.id}: blank tag`).not.toBe('');
        expect(dupes(p.tags), `${p.id}: repeated tag`).toEqual([]);
      }
    });

    it('the visible ones are all of them but those with show: false, newest first', () => {
      const hidden = list.filter((p) => p.show === false);
      expect(visible).toHaveLength(list.length - hidden.length);
      for (const p of hidden) expect(visible).not.toContain(p);
      const dates = visible.map((p) => p.started);
      expect(dates).toEqual([...dates].sort().reverse());
    });
  });
}

describeEntries('projects', projects, visibleProjects);

describe('projects: the rest', () => {
  it('lane is hardware or software', () => {
    for (const p of projects) expect(['hardware', 'software'], `${p.id}: lane "${p.lane}"`).toContain(p.lane);
  });

  it('repo is a bare GitHub repo name (the page prefixes the user), live is an https URL', () => {
    for (const p of projects) {
      if (p.repo !== undefined) expect(p.repo, `${p.id}: repo`).toMatch(/^[A-Za-z0-9._-]+$/);
      if (p.live !== undefined) {
        expect(p.live, `${p.id}: live`).toMatch(/^https:\/\//);
        expect(() => new URL(p.live!), `${p.id}: live`).not.toThrow();
      }
    }
  });

  it('a screenshot comes with its alt text, and a status is not blank', () => {
    for (const p of projects) {
      if (p.image) expect((p.imageAlt ?? '').trim(), `${p.id}: image without imageAlt`).not.toBe('');
      if (p.status !== undefined) expect(p.status.trim(), `${p.id}: blank status`).not.toBe('');
    }
  });
});

describeEntries('upstream projects', upstreamProjects, visibleUpstream);

describe('upstream projects: the rest', () => {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = `(${MONTHS.join('|')})`;
  // "Apr 2026", "May – Jul 2026", "Mar 2025 – Oct 2026"
  const SPAN = new RegExp(`^${month}(?: (\\d{4}))?(?: – ${month}(?: (\\d{4}))?)?$`);

  it('has a section title and blurb', () => {
    expect(upstream.title.trim()).not.toBe('');
    expect(upstream.blurb.trim()).not.toBe('');
  });

  it('repo is owner/name (the page builds github.com/<repo>/pulls from it), and listed once', () => {
    for (const p of upstreamProjects) expect(p.repo, p.id).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
    expect(dupes(upstreamProjects.map((p) => p.repo.toLowerCase())), 'a repo is listed twice').toEqual([]);
  });

  it('span reads like "Apr 2026", "May – Jul 2026" or "Mar 2025 – Oct 2026", and begins in the month `started` is in', () => {
    for (const p of upstreamProjects) {
      const m = SPAN.exec(p.span);
      expect(m, `${p.id}: span "${p.span}"`).not.toBeNull();
      const [, m1, y1, m2, y2] = m!;
      const startYear = Number(y1 ?? y2);
      expect(startYear, `${p.id}: span "${p.span}" has no year`).not.toBeNaN();
      const [sy, sm] = p.started.split('-').map(Number);
      expect(`${MONTHS[sm - 1]} ${sy}`, `${p.id}: started ${p.started} but span "${p.span}"`).toBe(`${m1} ${startYear}`);
      if (m2) {
        const endYear = Number(y2 ?? y1);
        expect(endYear * 12 + MONTHS.indexOf(m2), `${p.id}: span "${p.span}" ends before it starts`).toBeGreaterThanOrEqual(
          startYear * 12 + MONTHS.indexOf(m1),
        );
      }
    }
  });
});

describe('site', () => {
  it('has the strings the page cannot do without', () => {
    for (const key of ['name', 'domain', 'role', 'intro', 'description', 'githubUser', 'github', 'blog'] as const) {
      expect(site[key].trim(), key).not.toBe('');
    }
  });

  it('domain is a bare host name, the links are https', () => {
    expect(site.domain).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
    for (const key of ['github', 'blog', 'linkedin'] as const) {
      if (site[key]) expect(site[key], key).toMatch(/^https:\/\//);
    }
  });

  it('the GitHub link is the GitHub user', () => {
    expect(site.github).toBe(`https://github.com/${site.githubUser}`);
  });

  it('email is blank (hidden) or looks like an address', () => {
    if (site.email) expect(site.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});
