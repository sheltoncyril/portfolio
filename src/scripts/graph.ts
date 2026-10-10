// Builds the git-graph SVG from the positions of the rendered project list and
// draws it as the reader scrolls. The <ol> underneath is the real content; the
// SVG is decoration (aria-hidden), so everything works if this script doesn't.

import { createPup } from './pup';

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 28; // corner radius where the hero line turns down
const F = 70; // vertical run of a fork / merge curve
const K = 34; // vertical run of the fork / merge curves of a project branch
const DOCK_FONT = 24; // px: size of the name once docked in the top-left corner
const BAR_H = 56; // px: height of the fixed top bar
const MARKER = 0.62; // fraction of viewport height where the line "is drawn up to"

type Kind = 'trunk' | 'hw' | 'sw' | 'rh';
type Lane = 'hw' | 'sw' | 'rh';
interface Seg { d: string; y0: number; y1: number; kind: Kind; hero?: boolean; el?: SVGPathElement; last?: number }
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
let treeW = 0; // viewport width the tree is laid out for; how far off-screen it waits
let slid = ''; // last transform written to the SVG
let forkIn: boolean | undefined; // whether the lane labels + layout toggle are currently revealed
// cyril: where the word "Cyril" sits inside the name at full size (x, width); stem: the right-hand edge of its
// last letter (a line: x at y, and how far x moves per px of y, since the letters lean) and the height the
// pup's face sits at. All relative to the name's top-left; the pup hides behind that letter.
const nm = {
  x: 0, top: 0, tx: 0, ty: 0, scale: 1, dist: 400, fs: 16,
  cyril: { x: 0, w: 0 },
  stem: { x: 0, y: 0, slope: 0, cy: 0 },
};
let pup: ReturnType<typeof createPup> | undefined;

function init() {
  if (!tree || !svg || !trace || !fork || !merge || !headAnchor || !rows.length) return;
  root.classList.add('graph-ready');
  pup = createPup(tree);

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
  // Everything here is measured from the rendered text, so measure again whenever the web fonts arrive:
  // on a phone connection they land well after this script runs, and `ready` alone can resolve before
  // they have even been requested.
  document.fonts?.ready.then(() => schedule(true));
  document.fonts?.addEventListener?.('loadingdone', () => schedule(true));
  document.fonts?.load('italic 1em "Abril Fatface"').then(() => schedule(true), () => {});
  addEventListener('load', () => schedule(true));
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
  nm.fs = fs;

  const word = nameEl.querySelector<HTMLElement>('span:last-child');
  if (word) {
    const c = word.getBoundingClientRect();
    nm.cyril = { x: c.left - r.left, w: c.width };
    // an empty inline-block sits on the baseline, which the layout box alone doesn't give us
    const probe = document.createElement('i');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    word.append(probe);
    const baseline = probe.getBoundingClientRect().bottom - r.top;
    probe.remove();
    nm.stem = stemOf(word, r, baseline, fs);
  }
}

// The right-hand edge of the last letter of the word, found by drawing that letter on a canvas in the same
// font and reading its pixels: that works for any font (serifs, slanted or not) without knowing its metrics.
function stemOf(word: HTMLElement, name: DOMRect, baseline: number, fs: number) {
  const text = word.lastChild;
  // fallback if anything below fails: a typical upright-ish stem a little in from the right of the word
  const fallback = { x: nm.cyril.x + nm.cyril.w - fs * 0.12, y: baseline - fs * 0.3, slope: -0.2, cy: baseline - fs * 0.38 };
  if (!text || text.nodeType !== 3 || !(text as Text).length) return fallback;
  const n = (text as Text).length;
  const range = document.createRange();
  range.setStart(text, n - 1);
  range.setEnd(text, n);
  const originX = range.getBoundingClientRect().left - name.left; // where the letter's drawing starts

  const st = getComputedStyle(word);
  const k = 2; // draw at twice the size for sub-pixel accuracy
  const size = fs * k;
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallback;
  const pad = Math.ceil(size * 0.3);
  const base = Math.ceil(size * 1.1);
  const cw = Math.ceil(size * 1.5);
  const ch = Math.ceil(size * 1.4);
  ctx.canvas.width = cw;
  ctx.canvas.height = ch;
  ctx.font = `${st.fontStyle} ${st.fontWeight} ${size}px ${st.fontFamily}`;
  ctx.fillStyle = '#000';
  ctx.fillText((text as Text).data[n - 1], pad, base);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, cw, ch).data; } catch { return fallback; }

  const inkRight = (row: number) => {
    for (let px = cw - 1; px >= 0; px--) if (data[(row * cw + px) * 4 + 3] > 110) return px;
    return -1;
  };
  let topRow = -1;
  for (let row = 0; row < ch && topRow < 0; row++) if (inkRight(row) >= 0) topRow = row;
  if (topRow < 0 || topRow >= base) return fallback;
  const height = base - topRow; // how tall the letter stands above the baseline, in canvas px
  // two rows well inside the letter, clear of its serifs
  const rowA = Math.round(base - height * 0.28);
  const rowB = Math.round(base - height * 0.8);
  const xa = inkRight(rowA);
  const xb = inkRight(rowB);
  if (xa < 0 || xb < 0) return fallback;
  const toX = (px: number) => originX + (px - pad) / k;
  const toY = (row: number) => baseline + (row - base) / k;
  const ya = toY(rowA);
  const yb = toY(rowB);
  return { x: toX(xa), y: ya, slope: (toX(xb) - toX(xa)) / (yb - ya), cy: baseline - (height / k) * 0.52 };
}

function build() {
  measureName();
  const t = tree!.getBoundingClientRect();
  treeTop = t.top + scrollY;
  const branches = tree!.dataset.layout !== 'lanes';
  const isWide = wide.matches;

  const tr = rel(trace!);
  const y0 = tr.y;
  treeW = root.clientWidth;
  // The hero line starts one screen-width to the left of the tree. The tree waits one screen-width to the
  // right, so at scroll 0 the line exactly spans the screen; as the tree slides in, the line's right end
  // (the corner into the trunk) is pulled in from the right edge, and at rest it runs from the left edge
  // of the screen to the trunk.
  const x0 = -treeW - t.left;
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
  const r = Math.max(8, Math.min(R, tx - 2)); // corner radius shrinks when the trunk is close to the screen edge

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

  // the hero line runs to the trunk and turns down into it; it is part of the tree, so it slides in with it
  segs.push({ d: `M${x0},${y0} H${tx - r}`, y0, y1: y0, kind: 'trunk', hero: true });
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
    segs.push({ d: `M${tx - r},${y0} Q${tx},${y0} ${tx},${y0 + r} V${forkY}`, y0, y1: forkY, kind: 'trunk' });
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
    segs.push({ d: `M${tx - r},${y0} Q${tx},${y0} ${tx},${y0 + r} V${headY}`, y0, y1: headY, kind: 'trunk' });
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

  // the dog stands on the hero line; it peeks over the name before that
  const ox = nm.x; // the name's top-left in tree coordinates, as it sits at the top of the page
  const oy = nm.top - treeTop;
  pup?.layout({
    lineY: y0,
    endRest: tx - r,
    nameEnd: ox + nm.cyril.x + nm.cyril.w,
    unit: Math.min(4, Math.max(2, Math.round(nm.fs / 26))), // whole px per art pixel, scaled with the name
    stem: { x: ox + nm.stem.x, y: oy + nm.stem.y, slope: nm.stem.slope, cy: oy + nm.stem.cy },
  });

  render();
}

function render() {
  // clientWidth, not scrollWidth: the SVG is translated off to the right, which scrollWidth would count
  const w = Math.ceil(tree!.clientWidth);
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
    s.el = mk('path', { d: s.d, pathLength: '1', class: `seg ${s.kind}${s.hero ? ' hero' : ''}` });
  }
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
  paintTree(e);
  pup?.sync({ scrollY, treeTop, dx: (1 - e) * treeW, width: treeW, still });
  // the lane labels, the layout toggle and the cards wait until the tree has finished sliding in, so
  // none of them is ever seen next to a tree that's still off its mark
  const placed = e >= 0.99;
  if (placed !== forkIn) { forkIn = placed; fork!.classList.toggle('in', placed); }
  for (const s of segs) {
    if (s.hero || !s.el) continue;
    const p = still ? 1 : clamp((marker - s.y0) / Math.max(1, s.y1 - s.y0));
    if (p !== s.last) { s.last = p; s.el.style.strokeDashoffset = String(1 - p); }
  }
  for (const d of dots) {
    const on = still || marker >= d.y - 2;
    if (on !== d.on && d.el) { d.on = on; d.el.classList.toggle('on', on); }
  }
  for (const row of entries) {
    const on = placed && (still || marker >= row.y - 110);
    if (on !== row.on) { row.on = on; row.el.classList.toggle('in', on); }
  }
}

// The name starts big in the hero and shrinks into the top-left corner over the first stretch of
// scroll; the tree slides in from the right edge over the same stretch, with the same easing.
function dockProgress() {
  const t = clamp(scrollY / nm.dist);
  return reduce.matches ? (scrollY > 40 ? 1 : 0) : 1 - (1 - t) ** 3;
}

// The tree moves as one rigid piece: one screen-width to the right at e = 0 (only the hero line, which
// reaches back across the screen, is in view), at its normal place at e = 1.
function paintTree(e: number) {
  const dx = (1 - e) * treeW;
  const t = dx > 0.5 ? `translate(${dx.toFixed(1)}px, 0)` : '';
  if (t !== slid) { slid = t; svg!.style.transform = t; }
}

function paintName(e: number) {
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
