// Builds the git-graph SVG from the positions of the rendered project list and
// draws it as the reader scrolls. The <ol> underneath is the real content; the
// SVG is decoration (aria-hidden), so everything works if this script doesn't.

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 28; // corner radius where the hero line turns down
const F = 70; // vertical run of a fork / merge curve
const SPUR = 30; // half-height of a spur in the "spurs" layout
const MARKER = 0.62; // fraction of viewport height where the line "is drawn up to"

type Kind = 'trunk' | 'hw' | 'sw';
interface Seg { d: string; y0: number; y1: number; kind: Kind; hero?: boolean; el?: SVGPathElement; last?: number }
interface Dot { x: number; y: number; kind: Kind | 'head'; el?: SVGElement; on?: boolean }
interface Row { el: HTMLElement; y: number; on?: boolean }

const root = document.documentElement;
const tree = document.querySelector<HTMLElement>('[data-tree]');
const svg = tree?.querySelector<SVGSVGElement>('.tree-svg');
const trace = tree?.querySelector<HTMLElement>('[data-trace]');
const fork = tree?.querySelector<HTMLElement>('.fork');
const merge = tree?.querySelector<HTMLElement>('.merge');
const headAnchor = tree?.querySelector<HTMLElement>('.head-anchor');
const rows = tree ? [...tree.querySelectorAll<HTMLElement>('.entry')] : [];

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const wide = matchMedia('(min-width: 860px)');
const safe = <T,>(fn: () => T): T | undefined => { try { return fn(); } catch { return undefined; } };

let segs: Seg[] = [];
let dots: Dot[] = [];
let entries: Row[] = [];
let treeTop = 0;
let first = true;

function init() {
  if (!tree || !svg || !trace || !fork || !merge || !headAnchor || !rows.length) return;
  root.classList.add('graph-ready');

  const q = new URLSearchParams(location.search).get('layout');
  const saved = safe(() => localStorage.getItem('layout'));
  setLayout(q === 'spurs' || q === 'lanes' ? q : saved === 'spurs' ? 'spurs' : 'lanes', false);

  document.querySelectorAll<HTMLButtonElement>('[data-set-layout]').forEach((b) =>
    b.addEventListener('click', () => setLayout(b.dataset.setLayout === 'spurs' ? 'spurs' : 'lanes', true)),
  );
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', toggleTheme);

  new ResizeObserver(() => schedule(true)).observe(tree);
  addEventListener('scroll', () => schedule(false), { passive: true });
  reduce.addEventListener('change', () => schedule(true));
  wide.addEventListener('change', () => schedule(true));
  build();
  paint();
}

function setLayout(l: 'lanes' | 'spurs', persist: boolean) {
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

function build() {
  const t = tree!.getBoundingClientRect();
  treeTop = t.top + scrollY;
  const spurs = tree!.dataset.layout === 'spurs';
  const isWide = wide.matches;

  const tr = rel(trace!);
  const y0 = tr.y;
  const x0 = tr.x;
  const a = rel(rows[0].querySelector('.anchor')!);

  let tx: number, hx: number, sx: number;
  if (isWide) {
    tx = a.x + a.w / 2;
    [hx, sx] = spurs ? [tx - 56, tx + 56] : [tx - 22, tx + 22];
  } else if (spurs) {
    tx = a.x + 12; hx = a.x + 32; sx = a.x + 50;
  } else {
    tx = a.x + 32; hx = a.x + 12; sx = a.x + 52;
  }
  const laneX = { hw: hx, sw: sx };

  const f = rel(fork!);
  const m = rel(merge!);
  const h = rel(headAnchor!);
  const headY = h.y;

  segs = [];
  dots = [];
  entries = rows.map((el) => ({ el, y: rel(el.querySelector('.anchor')!).y }));

  segs.push({ d: `M${x0},${y0} H${tx - R}`, y0, y1: y0, kind: 'trunk', hero: true });

  if (!spurs) {
    const forkY = f.y + 10;
    const laneTop = forkY + F;
    const laneEnd = m.y + 10;
    const mergeEnd = laneEnd + F;
    segs.push({ d: `M${tx - R},${y0} Q${tx},${y0} ${tx},${y0 + R} V${forkY}`, y0, y1: forkY, kind: 'trunk' });
    for (const k of ['hw', 'sw'] as const) {
      const x = laneX[k];
      segs.push({ d: `M${tx},${forkY} C${tx},${forkY + F * 0.55} ${x},${forkY + F * 0.45} ${x},${laneTop}`, y0: forkY, y1: laneTop, kind: k });
      segs.push({ d: `M${x},${laneTop} V${laneEnd}`, y0: laneTop, y1: laneEnd, kind: k });
      segs.push({ d: `M${x},${laneEnd} C${x},${laneEnd + F * 0.55} ${tx},${laneEnd + F * 0.45} ${tx},${mergeEnd}`, y0: laneEnd, y1: mergeEnd, kind: k });
    }
    segs.push({ d: `M${tx},${mergeEnd} V${headY}`, y0: mergeEnd, y1: headY, kind: 'trunk' });
    dots.push({ x: tx, y: forkY, kind: 'trunk' }, { x: tx, y: mergeEnd, kind: 'trunk' });
  } else {
    segs.push({ d: `M${tx - R},${y0} Q${tx},${y0} ${tx},${y0 + R} V${headY}`, y0, y1: headY, kind: 'trunk' });
    for (const e of entries) {
      const k = e.el.dataset.lane === 'hw' ? 'hw' : 'sw';
      const nx = laneX[k];
      segs.push({
        d: `M${tx},${e.y - SPUR} Q${tx},${e.y} ${nx},${e.y} Q${tx},${e.y} ${tx},${e.y + SPUR}`,
        y0: e.y - SPUR, y1: e.y + SPUR, kind: k,
      });
    }
  }
  for (const e of entries) {
    const k = e.el.dataset.lane === 'hw' ? 'hw' : 'sw';
    dots.push({ x: laneX[k], y: e.y, kind: k });
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
  for (const d of dots) {
    const r = d.kind === 'head' ? 8 : 6;
    d.on = undefined;
    if (d.kind === 'hw') {
      d.el = mk('rect', { x: String(d.x - r + 0.5), y: String(d.y - r + 0.5), width: String(2 * r - 1), height: String(2 * r - 1), rx: '3', class: 'node hw' });
    } else {
      d.el = mk('circle', { cx: String(d.x), cy: String(d.y), r: String(d.kind === 'head' ? r : r - 0.5), class: `node ${d.kind}` });
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
  for (const s of segs) {
    if (s.hero || !s.el) continue;
    const p = still ? 1 : clamp((marker - s.y0) / Math.max(1, s.y1 - s.y0));
    if (p !== s.last) { s.last = p; s.el.style.strokeDashoffset = String(1 - p); }
  }
  for (const d of dots) {
    const on = still || marker >= d.y - 2;
    if (on !== d.on && d.el) { d.on = on; d.el.classList.toggle('on', on); }
  }
  for (const e of entries) {
    const on = still || marker >= e.y - 110;
    if (on !== e.on) { e.on = on; e.el.classList.toggle('in', on); }
  }
}

init();
