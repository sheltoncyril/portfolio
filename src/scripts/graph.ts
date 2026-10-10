// Builds the git-graph SVG from the positions of the rendered project list and
// draws it as the reader scrolls. The <ol> underneath is the real content; the
// SVG is decoration (aria-hidden), so everything works if this script doesn't.

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 28; // corner radius where the hero line turns down
const F = 70; // vertical run of a fork / merge curve
const K = 34; // vertical run of the fork / merge curves of a project branch
const DOCK_FONT = 24; // px: size of the name once docked in the top-left corner
const BAR_H = 56; // px: height of the fixed top bar
const MARKER = 0.62; // fraction of viewport height where the line "is drawn up to"

type Kind = 'trunk' | 'hw' | 'sw' | 'rh';
type Lane = 'hw' | 'sw' | 'rh';
interface Seg { d: string; y0: number; y1: number; kind: Kind; hero?: boolean; gate?: boolean; el?: SVGPathElement; last?: number }
interface Dot { x: number; y: number; kind: Kind | 'head' | 'tick'; el?: SVGElement; on?: boolean }
interface Row { el: HTMLElement; y: number; top: number; bottom: number; on?: boolean }
type Layout = 'branches' | 'lanes';

const root = document.documentElement;
const tree = document.querySelector<HTMLElement>('[data-tree]');
const svg = tree?.querySelector<SVGSVGElement>('.tree-svg');
const trace = tree?.querySelector<HTMLElement>('[data-trace]');
const fork = tree?.querySelector<HTMLElement>('.fork');
const merge = tree?.querySelector<HTMLElement>('.merge');
const upHead = tree?.querySelector<HTMLElement>('[data-upstream-head]');
const headAnchor = tree?.querySelector<HTMLElement>('.head-anchor');
const rows = tree ? [...tree.querySelectorAll<HTMLElement>('.entry')] : [];
const nameEl = document.querySelector<HTMLElement>('[data-name]');
const slot = document.querySelector<HTMLElement>('[data-name-slot]');
const eyebrow = document.querySelector<HTMLElement>('.eyebrow');

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const wide = matchMedia('(min-width: 860px)');
const safe = <T,>(fn: () => T): T | undefined => { try { return fn(); } catch { return undefined; } };

let segs: Seg[] = [];
let dots: Dot[] = [];
let entries: Row[] = [];
let treeTop = 0;
let first = true;
const nm = { x: 0, top: 0, tx: 0, ty: 0, scale: 1, dist: 400 };
// The hero line enters from the right edge and sweeps left to the trunk as the name docks.
const heroLine = { el: undefined as SVGPathElement | undefined, y: 0, xe: 0 };

function init() {
  if (!tree || !svg || !trace || !fork || !merge || !headAnchor || !rows.length) return;
  root.classList.add('graph-ready');

  const q = new URLSearchParams(location.search).get('layout');
  const saved = safe(() => localStorage.getItem('layout'));
  const pick = [q, saved].find((v) => v === 'branches' || v === 'lanes') as Layout | undefined;
  setLayout(pick ?? 'branches', false);

  document.querySelectorAll<HTMLButtonElement>('[data-set-layout]').forEach((b) =>
    b.addEventListener('click', () => setLayout(b.dataset.setLayout === 'lanes' ? 'lanes' : 'branches', true)),
  );
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', toggleTheme);

  new ResizeObserver(() => schedule(true)).observe(tree);
  addEventListener('scroll', () => schedule(false), { passive: true });
  reduce.addEventListener('change', () => schedule(true));
  wide.addEventListener('change', () => schedule(true));
  document.fonts?.ready.then(() => schedule(true));
  build();
  paint();
}

function setLayout(l: Layout, persist: boolean) {
  tree!.dataset.layout = l;
  document.querySelectorAll<HTMLButtonElement>('[data-set-layout]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.setLayout === l)),
  );
  if (persist) {
    safe(() => localStorage.setItem('layout', l));
    first = false;
    schedule(true);
  }
}

function toggleTheme() {
  const cur = root.dataset.theme ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const next = cur === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  safe(() => localStorage.setItem('theme', next));
}

let raf = 0;
let needBuild = false;
function schedule(rebuild: boolean) {
  needBuild ||= rebuild;
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (needBuild) { needBuild = false; build(); }
    paint();
  });
}

const rel = (el: Element) => {
  const r = el.getBoundingClientRect();
  const t = tree!.getBoundingClientRect();
  return { x: r.left - t.left, y: r.top - t.top, w: r.width, h: r.height };
};

function measureName() {
  if (!nameEl || !slot) return;
  nameEl.style.transform = 'none';
  const r = nameEl.getBoundingClientRect();
  slot.style.height = `${r.height}px`;
  const sr = slot.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(nameEl).fontSize);
  nm.x = sr.left;
  nm.top = sr.top + scrollY;
  nm.scale = Math.min(1, DOCK_FONT / fs);
  nm.tx = parseFloat(getComputedStyle(document.querySelector('.bar')!).paddingLeft) || 20;
  nm.ty = (BAR_H - r.height * nm.scale) / 2;
  nm.dist = Math.min(innerHeight * 0.55, 460);
}

function build() {
  measureName();
  const t = tree!.getBoundingClientRect();
  treeTop = t.top + scrollY;
  const branches = tree!.dataset.layout !== 'lanes';
  const isWide = wide.matches;

  const tr = rel(trace!);
  const y0 = tr.y;
  const a = rel(rows[0].querySelector('.anchor')!);

  // x of the trunk and of each lane / branch, per layout and breakpoint
  let tx: number, hx: number, sx: number, rx: number;
  if (isWide) {
    tx = a.x + a.w / 2;
    const w = branches ? 100 : 56;
    hx = tx - w;
    sx = tx + w;
    rx = branches ? sx : tx + 112;
  } else if (branches) {
    tx = a.x + 12; hx = sx = rx = a.x + 46;
  } else {
    tx = a.x + 26; hx = a.x + 10; sx = a.x + 42; rx = a.x + 58;
  }
  const laneX: Record<Lane, number> = { hw: hx, sw: sx, rh: rx };
  const r = R;
  const right = root.clientWidth;

  const f = rel(fork!);
  const m = rel(merge!);
  const h = rel(headAnchor!);
  const headY = h.y;

  segs = [];
  dots = [];
  entries = rows.map((el) => {
    const c = rel(el.querySelector('.card')!);
    return { el, y: rel(el.querySelector('.anchor')!).y, top: c.y, bottom: c.y + c.h };
  });

  segs.push({ d: `M${right},${y0} H${tx + r}`, y0, y1: y0, kind: 'trunk', hero: true });
  Object.assign(heroLine, { y: y0, xe: tx + r });
  const lane = (e: Row) => (e.el.dataset.lane === 'hw' ? 'hw' : e.el.dataset.lane === 'rh' ? 'rh' : 'sw') as Lane;
  const own = entries.filter((e) => lane(e) !== 'rh');
  const up = entries.filter((e) => lane(e) === 'rh');
  // the red upstream branch spans from its section heading to the bottom of its last card
  const upTop = up.length && upHead ? rel(upHead).y + 4 : 0;
  const upBottom = up.length ? Math.max(...up.map((e) => e.bottom)) : 0;
  const bump = (x0: number, x1: number, top: number, bottom: number, k: Kind) => ({
    d: `M${x0},${top} C${x0},${top + K * 0.6} ${x1},${top + K * 0.4} ${x1},${top + K} V${bottom - K} C${x1},${bottom - K * 0.4} ${x0},${bottom - K * 0.6} ${x0},${bottom}`,
    y0: top, y1: bottom, kind: k,
  });

  if (!branches) {
    const forkY = f.y + 10;
    const laneTop = forkY + F;
    const laneEnd = m.y + 10;
    const mergeEnd = laneEnd + F;
    segs.push({ d: `M${tx + r},${y0} Q${tx},${y0} ${tx},${y0 + r} V${forkY}`, y0, y1: forkY, kind: 'trunk', gate: true });
    for (const k of ['hw', 'sw'] as const) {
      const x = laneX[k];
      segs.push({ d: `M${tx},${forkY} C${tx},${forkY + F * 0.55} ${x},${forkY + F * 0.45} ${x},${laneTop}`, y0: forkY, y1: laneTop, kind: k });
      segs.push({ d: `M${x},${laneTop} V${laneEnd}`, y0: laneTop, y1: laneEnd, kind: k });
      segs.push({ d: `M${x},${laneEnd} C${x},${laneEnd + F * 0.55} ${tx},${laneEnd + F * 0.45} ${tx},${mergeEnd}`, y0: laneEnd, y1: mergeEnd, kind: k });
    }
    segs.push({ d: `M${tx},${mergeEnd} V${headY}`, y0: mergeEnd, y1: headY, kind: 'trunk' });
    dots.push({ x: tx, y: forkY, kind: 'trunk' }, { x: tx, y: mergeEnd, kind: 'trunk' });
    for (const e of own) dots.push({ x: laneX[lane(e)], y: e.y, kind: lane(e) });
    if (up.length) {
      // upstream forks off the software lane, not off main
      segs.push(bump(sx, rx, upTop, upBottom, 'rh'));
      dots.push({ x: sx, y: upTop, kind: 'tick' }, { x: sx, y: upBottom, kind: 'tick' });
      for (const e of up) dots.push({ x: rx, y: e.y, kind: 'rh' });
    }
  } else {
    // main runs straight down; every project forks off it, runs beside its card, and merges back
    segs.push({ d: `M${tx + r},${y0} Q${tx},${y0} ${tx},${y0 + r} V${headY}`, y0, y1: headY, kind: 'trunk', gate: true });
    for (const e of own) {
      const k = lane(e);
      const x = laneX[k];
      segs.push(bump(tx, x, e.top, e.bottom, k));
      dots.push({ x: tx, y: e.top, kind: 'tick' }, { x: tx, y: e.bottom, kind: 'tick' }, { x, y: e.y, kind: k });
    }
    if (up.length) {
      segs.push(bump(tx, rx, upTop, upBottom, 'rh'));
      dots.push({ x: tx, y: upTop, kind: 'tick' }, { x: tx, y: upBottom, kind: 'tick' });
      for (const e of up) dots.push({ x: rx, y: e.y, kind: 'rh' });
    }
  }
  dots.push({ x: tx, y: headY, kind: 'head' });

  render(first);
  first = false;
}

function render(intro: boolean) {
  const w = Math.ceil(tree!.scrollWidth);
  const hgt = Math.ceil(tree!.scrollHeight);
  svg!.setAttribute('width', String(w));
  svg!.setAttribute('height', String(hgt));
  svg!.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg!.replaceChildren();

  const mk = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    svg!.append(el);
    return el;
  };

  for (const s of segs) if (!s.hero) mk('path', { d: s.d, class: 'ghost' });
  for (const s of segs) {
    s.last = undefined;
    s.el = mk('path', { d: s.d, pathLength: '1', class: `seg ${s.kind}${s.hero ? ' hero' + (intro ? ' intro' : '') : ''}` });
  }
  heroLine.el = segs.find((x) => x.hero)?.el;
  for (const d of dots) {
    const r = d.kind === 'head' ? 8 : d.kind === 'tick' ? 4 : 6;
    d.on = undefined;
    if (d.kind === 'rh') {
      d.el = mk('rect', { x: String(d.x - 5), y: String(d.y - 5), width: '10', height: '10', rx: '2', class: 'node rh' });
    } else if (d.kind === 'hw') {
      d.el = mk('rect', { x: String(d.x - r + 0.5), y: String(d.y - r + 0.5), width: String(2 * r - 1), height: String(2 * r - 1), rx: '3', class: 'node hw' });
    } else {
      d.el = mk('circle', { cx: String(d.x), cy: String(d.y), r: String(d.kind === 'head' || d.kind === 'tick' ? r : r - 0.5), class: `node ${d.kind}` });
    }
  }
  for (const e of entries) e.on = undefined;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

function paint() {
  // Near the bottom of the page, let the marker slide down so the last nodes complete.
  const maxScroll = root.scrollHeight - innerHeight;
  const boost = clamp(1 - (maxScroll - scrollY) / (innerHeight * 0.5));
  const marker = scrollY + innerHeight * (MARKER + (1 - MARKER) * boost) - treeTop;
  const still = reduce.matches;
  const e = dockProgress();
  paintName(e);
  for (const s of segs) {
    if (s.hero || !s.el) continue;
    let p = still ? 1 : clamp((marker - s.y0) / Math.max(1, s.y1 - s.y0));
    // the trunk only starts to drop once the hero line has reached it
    if (s.gate && !still) p = Math.min(p, clamp((e - 0.8) / 0.2));
    if (p !== s.last) { s.last = p; s.el.style.strokeDashoffset = String(1 - p); }
  }
  for (const d of dots) {
    const on = still || marker >= d.y - 2;
    if (on !== d.on && d.el) { d.on = on; d.el.classList.toggle('on', on); }
  }
  for (const row of entries) {
    const on = still || marker >= row.y - 110;
    if (on !== row.on) { row.on = on; row.el.classList.toggle('in', on); }
  }
}

// The name starts big in the hero and shrinks into the top-left corner over the first stretch of
// scroll; the line starts as a stub at the right edge and sweeps left to the trunk in step.
function dockProgress() {
  const t = clamp(scrollY / nm.dist);
  return reduce.matches ? (scrollY > 40 ? 1 : 0) : 1 - (1 - t) ** 3;
}

function paintName(e: number) {
  if (heroLine.el) {
    const full = root.clientWidth;
    const stub = full - Math.min(full * 0.28, 360); // where the line's left end sits at the top of the page
    const end = stub + (heroLine.xe - stub) * clamp(e / 0.8); // the sweep finishes at 80% of the dock, then the trunk takes over
    heroLine.el.setAttribute('d', `M${full},${heroLine.y} H${Math.min(end, full - 1)}`);
  }
  if (!nameEl) return;
  const live = nm.top - scrollY;
  const x = nm.x + (nm.tx - nm.x) * e;
  const y = live + (nm.ty - live) * e;
  const sc = 1 + (nm.scale - 1) * e;
  nameEl.style.transform = `translate(${x}px, ${y}px) scale(${sc})`;
  nameEl.classList.toggle('docked', e > 0.98);
  if (eyebrow) eyebrow.style.opacity = String(clamp(1 - e * 5));
}

init();
