// An 8-bit dog that lives on the hero line. It peeks over the top of the name until the page is scrolled,
// then drops onto the line and wanders along it, leaving paw prints that fade as it walks on.
//
// Pure decoration: aria-hidden, no pointer events, and the page is complete without it. graph.ts owns the
// geometry: it calls layout() when the tree is rebuilt and sync() on every paint. This module owns the
// sprite, the little state machine and its own animation loop. To make the dog interactive later, add
// states next to the existing ones (see State) and give the loop something to react to.

const W = 22; // sprite size in art pixels
const H = 17;
const OY = 2; // rows of empty space above the drawing, so the ear tips get an outline
const VIS = 10; // rows of the dog that show over the name while it peeks
const HEAD_DX = 5.5; // art pixels from the sprite's centre to the middle of its head
const PEEK_AFTER = 0.7; // s before the dog first lifts its head
const PEEK_RISE = 0.7; // s the lift takes
const TRIGGER = 6; // px of scroll that sets the dog off
const GRAVITY = 520; // px/s² per px of art pixel, so the small dog on a phone falls as slowly as it looks
const HOP = 12; // art pixels it jumps up before it falls
const PAWS = 10; // size of the paw-print pool
const PRINT_GAP = 6; // art pixels walked between two prints
const PRINT_LIFE = 36; // art pixels walked before a print has faded away

const COLORS: Record<string, string> = {
  o: '#2a1a12', // outline
  b: '#f3ead8', // coat
  c: '#fffbf2', // chest, muzzle, paws
  d: '#c4864a', // tan: ears, saddle, tail
  g: '#d6c9ae', // shade: the far legs
  t: '#ee6a80', // tongue
  w: '#ffffff',
};
const PAW_COLOR = '#c4864a';

type Grid = string[][];
interface Pose {
  dy?: number; // body drop
  legs?: number[]; // x of the near-back, far-back, near-front and far-front legs
  legY?: number;
  legH?: number;
  ears?: 'up' | 'high' | 'flat';
  tail?: 'up' | 'mid' | 'down';
  eye?: 'open' | 'shut' | 'wide';
  mouth?: boolean;
  sit?: boolean;
}

// The dog faces right; the sprite is mirrored in CSS to face left. It is composed from rectangles and then
// outlined automatically, which keeps each pose to a handful of lines.
function draw(p: Pose = {}): Grid {
  const { dy = 0, legs = [5, 8, 13, 11], legY = 12, legH = 3, ears = 'up', tail = 'up', eye = 'open', mouth = false, sit = false } = p;
  const g: Grid = Array.from({ length: H }, () => Array<string>(W).fill('.'));
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = y + OY; j < y + OY + h; j++) for (let i = x; i < x + w; i++) if (g[j] && i >= 0 && i < W) g[j][i] = c;
  };
  const px = (x: number, y: number, c: string) => rect(x, y, 1, 1, c);

  if (!sit) {
    rect(legs[1], legY, 2, legH, 'g');
    rect(legs[3], legY, 2, legH, 'g');
  }

  const ty = 6 + dy;
  if (tail === 'up') [[3, ty + 1], [2, ty], [2, ty - 1], [1, ty - 2], [2, ty - 3]].forEach(([x, y]) => px(x, y, 'd'));
  else if (tail === 'mid') [[3, ty + 1], [2, ty], [1, ty - 1], [0, ty - 1]].forEach(([x, y]) => px(x, y, 'd'));

  if (sit) {
    // a stair-stepped back from the neck down to the haunch, then a block to the ground
    rect(10, 7, 4, 1, 'b'); rect(8, 8, 7, 1, 'b'); rect(6, 9, 10, 1, 'b'); rect(4, 10, 12, 1, 'b');
    rect(3, 11, 13, 4, 'b');
    rect(5, 10, 5, 4, 'd'); // thigh
    rect(13, 9, 3, 5, 'c'); // chest
    rect(12, 13, 4, 2, 'c'); // paws
    rect(12, 11, 1, 3, 'g'); // gap between the haunch and the front legs
    rect(0, 13, 3, 2, 'd'); // tail on the ground
  } else {
    rect(4, 6 + dy, 11, 6, 'b');
    px(4, 6 + dy, '.'); px(4, 11 + dy, '.'); px(14, 11 + dy, '.');
    rect(6, 11 + dy, 5, 1, 'c'); // belly
    rect(12, 9 + dy, 3, 3, 'c'); // chest
    rect(4, 6 + dy, 3, 2, 'd'); // saddle
  }

  const hy = (sit ? 1 : 2) + dy;
  rect(12, hy, 7, 7, 'b');
  px(12, hy, '.'); px(18, hy, '.');
  rect(18, hy + 3, 4, 3, 'b'); // snout
  rect(18, hy + 5, 4, 1, 'c'); // muzzle
  rect(20, hy + 3, 2, 1, 'o'); // nose
  if (mouth) { rect(19, hy + 6, 2, 1, 'o'); rect(19, hy + 7, 2, 1, 't'); }
  if (eye === 'open') rect(17, hy + 2, 1, 2, 'o');
  else if (eye === 'shut') rect(16, hy + 3, 2, 1, 'o');
  else rect(16, hy + 2, 2, 2, 'o');
  if (ears === 'up') { rect(13, hy - 3, 2, 3, 'd'); px(13, hy - 1, 'd'); rect(16, hy - 2, 2, 2, 'd'); }
  else if (ears === 'high') { rect(13, hy - 4, 2, 4, 'd'); rect(16, hy - 3, 2, 3, 'd'); }
  else { rect(12, hy, 3, 4, 'd'); px(11, hy + 1, 'd'); rect(16, hy - 1, 2, 1, 'd'); }

  if (!sit) {
    rect(legs[0], legY, 2, legH, 'b');
    rect(legs[2], legY, 2, legH, 'b');
  }

  // outline: every empty cell that touches a painted one (the row under the feet falls off the grid on purpose,
  // so the dog stands on the line rather than on a dark band)
  const out = g.map((r) => r.slice());
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g[y][x] !== '.') continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy2]) => (g[y + dy2]?.[x + dx] ?? '.') !== '.')) out[y][x] = 'o';
    }
  }
  return out;
}

const POSES: Record<string, Pose> = {
  stand: {},
  blink: { eye: 'shut' },
  walk0: { legs: [4, 9, 14, 11] },
  walk1: { legs: [6, 7, 12, 13], legY: 11, legH: 4, dy: -1 },
  walk2: { legs: [8, 4, 11, 14] },
  walk3: { legs: [6, 7, 12, 13], legY: 11, legH: 4, dy: -1 },
  fall: { legs: [2, 4, 14, 12], legY: 10, legH: 3, ears: 'high', mouth: true, eye: 'wide', dy: -2 },
  land: { dy: 2, legY: 14, legH: 1, ears: 'flat', eye: 'shut', legs: [2, 7, 15, 12] },
  sit: { sit: true, tail: 'down' },
  sitBlink: { sit: true, tail: 'down', eye: 'shut' },
};
const WALK = ['walk0', 'walk1', 'walk2', 'walk3'];

// one <path> per colour, one run of pixels per row
function paths(g: Grid, colors: Record<string, string>): string {
  const by: Record<string, string> = {};
  g.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const c = row[x];
      if (c === '.') { x++; continue; }
      let n = 1;
      while (row[x + n] === c) n++;
      by[c] = (by[c] ?? '') + `M${x} ${y}h${n}v1h-${n}z`;
      x += n;
    }
  });
  return Object.entries(by).map(([c, d]) => `<path fill="${colors[c]}" d="${d}"/>`).join('');
}

const PAW_GRID: Grid = ['..#.#..', '#.....#', '..###..', '.#####.', '..###..'].map((r) => [...r]);
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const easeOut = (t: number) => 1 - (1 - clamp(t)) ** 3;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export interface PupWorld {
  lineY: number; // y of the hero line's centre, in tree coordinates
  endRest: number; // x where the line turns down into the trunk once the tree is in place
  headX: number; // x the peeking head is centred on
  edgeY: number; // y of the edge the dog peeks over
  nameEnd: number; // x of the right edge of the name; the dog keeps clear of it when there is open line beside it
  unit: number; // px per art pixel
}
export interface PupView {
  scrollY: number;
  treeTop: number;
  dx: number; // how far the tree is still translated to the right (the line's end moves with it)
  width: number; // viewport width; the line runs past it while the tree is still sliding in
  still: boolean; // prefers-reduced-motion
}

// leave: running out of the left edge because the line has become too short to stand on; away: gone, until
// the line is long enough again
type State = 'peek' | 'drop' | 'land' | 'idle' | 'walk' | 'leave' | 'away';

export function createPup(host: HTMLElement) {
  const layer = document.createElement('div');
  layer.className = 'pup-layer';
  layer.setAttribute('aria-hidden', 'true');
  const dog = document.createElement('div');
  dog.className = 'pup';
  layer.append(dog);
  host.append(layer);

  let world: PupWorld | undefined;
  let view: PupView = { scrollY: 0, treeTop: 0, dx: 0, width: 0, still: false };
  let u = 0; // px per art pixel the sprite was built for
  let frames: Record<string, SVGGElement> = {};
  let art: SVGSVGElement | undefined;
  let paws: { el: SVGSVGElement; x: number; y: number; at: number; o: number }[] = [];

  let state: State = 'peek';
  let started = false;
  let t = 0; // seconds spent in the current state
  let x = 0; // centre of the sprite
  let feet = 0; // bottom edge of the sprite
  let vy = 0;
  let facing: 1 | -1 = 1;
  let hide = VIS; // rows of the dog still tucked behind the name
  let clip = 0; // px of the sprite shown from its top while it comes out from behind the name; H*u = all
  let out = false; // clear of the name's top edge (so no longer cut by it)
  let goal = 0;
  let idleFor = 1;
  let blinkAt = 3;
  let travel = 0; // px walked so far; prints fade by distance, not by time
  let stampedAt = 0;
  let side: 1 | -1 = 1;
  let ring = 0;
  let pose = '';
  let raf = 0;
  let last = 0;
  const shown = { tr: '', flip: 0, clip: '', op: -1, z: '', vis: '' };

  function build() {
    if (!world) return;
    u = world.unit;
    dog.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'pup-art');
    svg.setAttribute('width', String(W * u));
    svg.setAttribute('height', String(H * u));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = Object.entries(POSES)
      .map(([name, p]) => `<g data-pose="${name}" display="none">${paths(draw(p), COLORS)}</g>`)
      .join('');
    dog.append(svg);
    art = svg;
    frames = {};
    svg.querySelectorAll<SVGGElement>('g').forEach((g) => (frames[g.dataset.pose!] = g));
    pose = '';
    shown.tr = shown.clip = '';
    shown.flip = 0;

    const pu = Math.max(1, Math.round(u / 2));
    layer.querySelectorAll('.paw').forEach((p) => p.remove());
    paws = Array.from({ length: PAWS }, () => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      el.setAttribute('class', 'paw');
      el.setAttribute('width', String(7 * pu));
      el.setAttribute('height', String(5 * pu));
      el.setAttribute('viewBox', '0 0 7 5');
      el.innerHTML = paths(PAW_GRID, { '#': PAW_COLOR });
      el.style.opacity = '0';
      layer.append(el);
      return { el, x: 0, y: 0, at: -1e9, o: 0 };
    });
  }

  const half = () => (W * u) / 2;
  const lineEnd = () => (world ? world.endRest + view.dx : 0);
  const lo = () => half() + 2; // the sprite's left edge stays on screen...
  // ...and so does its right edge, with its snout over the line (the line runs past the screen's edge
  // while the tree is still sliding in)
  const hi = () => Math.min(lineEnd() - half(), view.width - half() - 2);
  // can a dog stand on the line at all? On a phone the line is only a short stub once the tree is in place.
  const fits = () => hi() - lo() >= 2 * u;
  // The stretch it walks on. Where there is open line beside the name it keeps clear of the name (on a phone
  // the dog is nearly as tall as the name, so standing under it hides the logo); otherwise the whole line.
  function zone(): [number, number] {
    const clear = world!.nameEnd + 8 + half();
    return hi() - clear >= 3 * half() ? [clear, hi()] : [lo(), hi()];
  }
  const grounded = () => state === 'land' || state === 'idle' || state === 'walk' || state === 'leave';

  function settle() {
    // the dog stands on the line
    state = 'idle';
    t = 0;
    vy = 0;
    clip = H * u;
    idleFor = rand(0.5, 1.2);
    blinkAt = rand(1, 3);
    setPose('sit');
  }

  function setPose(name: string) {
    if (name === pose || !frames[name]) return;
    if (frames[pose]) frames[pose].setAttribute('display', 'none');
    frames[name].removeAttribute('display');
    pose = name;
  }

  function release() {
    // Scrolling knocks it loose: a little hop up and out from behind the name (the name is only a few
    // pixels above the line on a phone, so a straight drop would be over in a blink), then it falls.
    state = 'drop';
    t = 0;
    // high enough to clear the name's top edge even if it is knocked loose before it has finished rising
    const rise = Math.max(HOP * u, feet - world!.edgeY + 2 * u);
    vy = -Math.sqrt(2 * GRAVITY * u * rise);
    out = false;
    setPose('fall');
  }

  function land() {
    state = 'land';
    t = 0;
    vy = 0;
    feet = world!.lineY - 1;
    setPose('land');
    if (!view.still) puff();
  }

  function puff() {
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('i');
      d.className = 'dust';
      const o = (i - 1.5) * 2;
      d.style.cssText = `left:${Math.round(x + o * u * 2)}px;top:${Math.round(feet - u * 1.5)}px;width:${u}px;height:${u}px;--dx:${Math.round(o * 7)}px`;
      layer.append(d);
      setTimeout(() => d.remove(), 600);
    }
  }

  function walk(dir: 1 | -1, dist: number) {
    state = 'walk';
    t = 0;
    facing = dir;
    goal = x + dir * dist;
  }

  function stamp() {
    const p = paws[ring];
    ring = (ring + 1) % paws.length;
    side = (-side) as 1 | -1;
    p.x = x - facing * 1.5 * u;
    p.y = world!.lineY + side * 3;
    p.at = travel;
    p.o = -1;
    const pu = Math.max(1, Math.round(u / 2));
    p.el.style.left = `${Math.round(p.x - (7 * pu) / 2)}px`;
    p.el.style.top = `${Math.round(p.y - (5 * pu) / 2)}px`;
    p.el.style.transform = `rotate(${facing > 0 ? 90 : -90}deg)`;
  }

  function fadePaws() {
    const life = PRINT_LIFE * u;
    const end = lineEnd();
    for (const p of paws) {
      // eight-bit fade: four steps; a print is gone once the dog has walked a fixed distance on, or once
      // the line has been pulled back from under it
      const o = p.x > end - 2 ? 0 : Math.ceil(clamp(1 - (travel - p.at) / life) * 4) / 4;
      if (o !== p.o) { p.o = o; p.el.style.opacity = String(o); }
    }
  }

  function step(dt: number) {
    t += dt;
    const w = world!;
    if (state === 'peek') {
      hide = VIS * (1 - easeOut((t - PEEK_AFTER) / PEEK_RISE));
      if (t > blinkAt) { setPose('blink'); if (t > blinkAt + 0.14) { blinkAt = t + rand(2.5, 4.5); setPose('stand'); } }
      else if (pose !== 'stand') setPose('stand');
      return;
    }
    if (state === 'drop') {
      vy += GRAVITY * u * dt;
      feet += vy * dt;
      // while it rises out from behind the name its body is cut at the name's top edge; once its feet
      // are clear of that edge it is in front of everything and nothing is cut any more
      if (feet <= w.edgeY) out = true;
      clip = out ? H * u : clamp(w.edgeY - (feet - H * u), 0, H * u);
      if (vy > 0 && feet >= w.lineY - 1) land();
      return;
    }
    // on the line from here on
    feet = w.lineY - 1;

    if (state === 'away') {
      // back once the line is long enough again (scrolled back to the top): it walks in from the left edge
      if (!fits()) return;
      x = -half() - 2;
      state = 'walk';
      facing = 1;
      goal = zone()[0] + rand(6, 14) * u;
      t = 0;
    } else if (!fits() && state !== 'leave') {
      // the tree has slid in and left only a stub of line: run out of the left edge rather than hang
      // half off the screen
      state = 'leave';
      facing = -1;
      t = 0;
    }

    if (state === 'leave') {
      x -= 14 * u * 1.8 * dt;
      travel += 14 * u * 1.8 * dt;
      setPose(WALK[Math.floor(t / 0.09) % WALK.length]);
      if (x <= -half() - 2) { state = 'away'; t = 0; }
      return;
    }

    const top = hi();
    if (x > top) {
      // the line is being pulled in from under the dog (the tree slides in as you scroll): it keeps its
      // footing and trots along ahead of the end
      const from = x;
      x = top;
      if (state !== 'walk' || facing > 0) { state = 'walk'; facing = -1; goal = x - 6 * u; t = 0; }
      travel += Math.abs(from - x);
    }

    if (state === 'land') {
      if (t > 0.18) settle();
    } else if (state === 'idle') {
      if (t > blinkAt) { setPose('sitBlink'); if (t > blinkAt + 0.14) { blinkAt = t + rand(2, 4); setPose('sit'); } }
      else setPose('sit');
      if (t > idleFor) {
        const [a, b] = zone();
        let dir: 1 | -1;
        let dist: number;
        if (x < a - 1) {
          // not in its stretch yet (it landed under the name): head for it
          dir = 1;
          dist = Math.min(b - x, a - x + rand(4, 16) * u);
        } else {
          dir = Math.random() < 0.5 ? 1 : -1;
          const room = (d: number) => (d > 0 ? b - x : x - a);
          if (room(dir) < 10 * u) dir = (-dir) as 1 | -1;
          dist = Math.min(room(dir), rand(14, 40) * u);
        }
        if (dist < 2 * u) { t = 0; idleFor = 1; return; }
        walk(dir, dist);
        idleFor = rand(0.7, 1.8);
      }
    } else if (state === 'walk') {
      const [a, b] = zone();
      const outside = x < a - 0.5; // left of its stretch: under the name, or just coming in from the edge
      if (outside && facing < 0) { state = 'idle'; t = 0; return; } // never walks further out
      const from = x;
      x += facing * 14 * u * dt;
      const arrived = facing > 0 ? x >= goal : x <= goal;
      if (!outside) x = Math.max(x, a);
      x = Math.min(x, b);
      travel += Math.abs(x - from);
      setPose(WALK[Math.floor(t / 0.12) % WALK.length]);
      if (travel - stampedAt >= PRINT_GAP * u) { stampedAt = travel; stamp(); }
      if (arrived || (!outside && x <= a) || x >= b) { state = 'idle'; t = 0; blinkAt = rand(1, 3); }
    }
  }

  function render() {
    if (!world || !art) return;
    const w = world;
    if (!pose) setPose(state === 'drop' ? 'fall' : state === 'land' ? 'land' : state === 'peek' ? 'stand' : 'sit'); // after a rebuild
    if (state === 'peek') {
      x = w.headX - HEAD_DX * u;
      feet = w.edgeY - VIS * u + hide * u + H * u;
      clip = (VIS - hide) * u;
    } else if (grounded()) {
      feet = w.lineY - 1;
    }
    const left = Math.round(x - half());
    const topY = Math.round(feet - H * u);
    const tr = `translate(${left}px, ${topY}px)`;
    if (tr !== shown.tr) { shown.tr = tr; dog.style.transform = tr; }

    const flip = facing;
    if (flip !== shown.flip) { shown.flip = flip; art.style.transform = flip < 0 ? 'scaleX(-1)' : ''; }

    const c = state === 'peek' || (state === 'drop' && clip < H * u) ? `inset(0 0 ${Math.max(0, H * u - clip)}px 0)` : '';
    if (c !== shown.clip) { shown.clip = c; dog.style.clipPath = c; }

    const vis = state === 'away' ? 'hidden' : '';
    if (vis !== shown.vis) { shown.vis = vis; dog.style.visibility = vis; }

    // in front of the name once it has dropped out from behind it; fading as it nears the fixed top bar
    const z = state === 'peek' ? '' : '12';
    if (z !== shown.z) { shown.z = z; dog.style.zIndex = z; }
    const vyTop = view.treeTop + feet - view.scrollY;
    const op = state === 'peek' ? 1 : clamp((vyTop - 28) / 36);
    if (op !== shown.op) { shown.op = op; dog.style.opacity = String(op); }
  }

  function onScreen() {
    if (!world) return false;
    const y = view.treeTop + feet - view.scrollY;
    return y > -40 && y - H * u < innerHeight + 40;
  }

  function tick(now: number) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!world) return;
    if (!view.still) step(dt);
    render();
    fadePaws();
    if (!view.still && onScreen() && !document.hidden) raf = requestAnimationFrame(tick);
  }

  function wake() {
    if (raf || view.still || !world) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  // the loop parks itself while the tab is hidden; pick it up again when it comes back
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

  return {
    /** The tree was (re)built: new positions, maybe a new size. */
    layout(w: PupWorld) {
      const resized = !world || w.unit !== world.unit;
      world = w;
      if (resized) build();
      if (!started) return;
      render();
      wake();
    },
    /** Called on every paint; cheap. */
    sync(v: PupView) {
      view = v;
      if (!world) return;
      if (!started) {
        started = true;
        x = world.headX - HEAD_DX * u;
        if (v.scrollY > TRIGGER || v.still) {
          // reloaded part-way down, or motion is off: it is simply there, on the line
          feet = world.lineY - 1;
          settle();
          setPose('sit');
          if (!fits()) state = 'away';
        } else {
          state = 'peek';
          setPose('stand');
          blinkAt = PEEK_AFTER + PEEK_RISE + rand(1.5, 3);
        }
      } else if (state === 'peek' && v.scrollY > TRIGGER) {
        release();
      } else if (v.still && state !== 'idle' && state !== 'away') {
        feet = world.lineY - 1;
        settle();
        setPose('sit');
      }
      if (v.still) {
        if (!fits()) state = 'away';
        else {
          if (state === 'away') settle();
          const [a, b] = zone();
          x = clamp(x, a, b);
        }
      }
      // draw straight away so there is never a frame with the dog unplaced; the loop takes over from here
      render();
      fadePaws();
      wake();
    },
  };
}
