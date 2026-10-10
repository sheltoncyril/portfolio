// An 8-bit pup that lives on the hero line. It starts out hiding behind the last letter of the name with
// only its face showing, pops out when the page is scrolled, drops onto the line and wanders along it,
// leaving paw prints that fade as it walks on. It follows the cursor (or the last tap), gets excited when
// you hover close, naps when nobody is paying attention and barks if you click it.
//
// Pure decoration: aria-hidden, no pointer events of its own, and the page is complete without it. graph.ts
// owns the geometry: it calls layout() when the tree is rebuilt and sync() on every paint. This module owns
// the little state machine and its animation loop; the pixel art is in pup-art.ts.

import { COLORS, paths, POSES, WALK, drawBody, drawFace, type FaceOpts, W, H, FW, FH, PAW_GRID, PAW_W, PAW_H } from './pup-art';

const HEAD_DX = 5.5; // art pixels from the body sprite's centre to the middle of its head...
const HEAD_DY = 5.5; // ...and from its top
const COVER = 0.3; // how much of the face stays behind the letter
const PEEK_AFTER = 0.8; // s before the face first slides out
const PEEK_RISE = 0.6; // s the slide takes
const TRIGGER = 6; // px of scroll that sets it off
const GRAVITY = 520; // px/s² per px of art pixel, so a small dog on a phone falls as slowly as it looks
const HOP = 12; // art pixels it jumps when it pops out
const PAWS = 10; // size of the paw-print pool
const PRINT_GAP = 6; // art pixels walked between two prints
const PRINT_LIFE = 36; // art pixels walked before a print has faded away
const SLEEP_AFTER = 9; // s without anyone touching the page before it curls up
const ATTENTION = 4.5; // s the dog keeps following a cursor that has stopped moving

export interface PupStem {
  x: number; // the right-hand edge of the letter it hides behind, at height y...
  y: number;
  slope: number; // ...and how far that edge moves for each px of height (italic letters lean)
  cy: number; // height the face sits at
}
export interface PupWorld {
  lineY: number; // y of the hero line's centre, in tree coordinates
  endRest: number; // x where the line turns down into the trunk once the tree is in place
  nameEnd: number; // x of the right edge of the name; the dog keeps clear of it when there is open line beside it
  unit: number; // px per art pixel
  stem: PupStem;
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
type State = 'peek' | 'drop' | 'land' | 'idle' | 'walk' | 'sniff' | 'sleep' | 'leave' | 'away';

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const easeOut = (t: number) => 1 - (1 - clamp(t)) ** 3;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const nowS = () => performance.now() / 1000;
const SVG_NS = 'http://www.w3.org/2000/svg';

export function createPup(host: HTMLElement) {
  const layer = document.createElement('div');
  layer.className = 'pup-layer';
  layer.setAttribute('aria-hidden', 'true');
  const dog = document.createElement('div');
  dog.className = 'pup';
  const face = document.createElement('div');
  face.className = 'pup pup-face';
  layer.append(face, dog);
  host.append(layer);

  let world: PupWorld | undefined;
  let view: PupView = { scrollY: 0, treeTop: 0, dx: 0, width: 0, still: false };
  let u = 0; // px per art pixel the sprites were built for
  let frames: Record<string, SVGGElement> = {};
  let art: SVGSVGElement | undefined;
  let faceArt: SVGSVGElement | undefined;
  let faceFrames = new Map<string, SVGGElement>();
  let faceKey = '';
  let paws: { el: SVGSVGElement; x: number; y: number; at: number; o: number }[] = [];

  let state: State = 'peek';
  let started = false;
  let t = 0; // seconds spent in the current state
  let x = 0; // centre of the body sprite
  let feet = 0; // bottom edge of the body sprite
  let vy = 0;
  let facing: 1 | -1 = 1;
  let quiet = false; // landing from a hop in place rather than a fall: no puff
  let faceHide = 1; // 1 = tucked right behind the letter, 0 = peeking
  let goal = 0;
  let idleFor = 1;
  let blinkAt = 3;
  let earAt = 6;
  let glanceAt = 2;
  let look = { ex: 0 as -1 | 0 | 1, ey: 0 as -1 | 0 | 1 };
  let travel = 0; // px walked so far; prints fade by distance, not by time
  let stampedAt = 0;
  let side: 1 | -1 = 1;
  let ring = 0;
  let pose = '';
  let raf = 0;
  let last = 0;
  let happyFor = 0;
  let nextHeart = 0;
  let nextZ = 0;
  const shown = { tr: '', flip: 0, op: -1, z: '', vis: '', faceTr: '', faceClip: '', faceVis: '' };

  // what it is paying attention to: the cursor while it moves, or wherever you last tapped
  const ptr = { x: 0, y: 0, at: -1e9, kind: 'mouse', inside: false };
  let callAt = -1e9;
  let callX = 0;
  let lastActive = nowS();

  const pr = () => Math.max(1, Math.floor(u / 2)); // px per art pixel for the paw prints, hearts

  // ---- building the sprites ------------------------------------------------------------------------

  function build() {
    if (!world) return;
    u = world.unit;
    dog.replaceChildren();
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'pup-art');
    svg.setAttribute('width', String(W * u));
    svg.setAttribute('height', String(H * u));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = Object.entries(POSES)
      .map(([name, p]) => `<g data-pose="${name}" display="none">${paths(drawBody(p), COLORS)}</g>`)
      .join('');
    dog.append(svg);
    art = svg;
    frames = {};
    svg.querySelectorAll<SVGGElement>('g').forEach((g) => (frames[g.dataset.pose!] = g));
    pose = '';

    face.replaceChildren();
    const fs = document.createElementNS(SVG_NS, 'svg');
    fs.setAttribute('width', String(FW * u));
    fs.setAttribute('height', String(FH * u));
    fs.setAttribute('viewBox', `0 0 ${FW} ${FH}`);
    face.append(fs);
    faceArt = fs;
    faceFrames = new Map();
    faceKey = '';

    Object.assign(shown, { tr: '', flip: 0, faceTr: '', faceClip: '' });

    const p = pr();
    layer.querySelectorAll('.paw').forEach((n) => n.remove());
    paws = Array.from({ length: PAWS }, () => {
      const el = document.createElementNS(SVG_NS, 'svg');
      el.setAttribute('class', 'paw');
      el.setAttribute('width', String(PAW_W * p));
      el.setAttribute('height', String(PAW_H * p));
      el.setAttribute('viewBox', `0 0 ${PAW_W} ${PAW_H}`);
      el.innerHTML = paths(PAW_GRID, COLORS);
      el.style.opacity = '0';
      layer.append(el);
      return { el, x: 0, y: 0, at: -1e9, o: 0 };
    });
  }

  function setPose(name: string) {
    if (name === pose || !frames[name]) return;
    if (frames[pose]) frames[pose].setAttribute('display', 'none');
    frames[name].removeAttribute('display');
    pose = name;
  }

  // the face has a lot of small variations (which way the eyes look, blinking...), so they are made on demand
  function setFace(o: FaceOpts) {
    if (!faceArt) return;
    const key = `${o.ex ?? 0},${o.ey ?? 0},${o.blink ? 1 : 0},${o.tongue ? 1 : 0},${o.ear ? 1 : 0}`;
    if (key === faceKey) return;
    let g = faceFrames.get(key);
    if (!g) {
      g = document.createElementNS(SVG_NS, 'g');
      g.innerHTML = paths(drawFace(o), COLORS);
      g.setAttribute('display', 'none');
      faceArt.append(g);
      faceFrames.set(key, g);
    }
    faceFrames.get(faceKey)?.setAttribute('display', 'none');
    g.removeAttribute('display');
    faceKey = key;
  }

  // ---- where things are -----------------------------------------------------------------------------

  const half = () => (W * u) / 2;
  const lineEnd = () => (world ? world.endRest + view.dx : 0);
  const lo = () => half() + 2; // the sprite's left edge stays on screen...
  // ...and so does its right edge, with its snout over the line (the line runs past the screen's edge
  // while the tree is still sliding in)
  const hi = () => Math.min(lineEnd() - half(), view.width - half() - 2);
  // can a dog stand on the line at all? On a phone the line is only a short stub once the tree is in place.
  const fits = () => hi() - lo() >= 2 * u;
  // The stretch it wanders on. Where there is open line beside the name it keeps clear of the name (on a
  // phone the dog is nearly as tall as the name, so standing under it hides the logo); otherwise the whole
  // line. When it is following the cursor it may go anywhere on the line.
  function zone(): [number, number] {
    const clear = world!.nameEnd + 8 + half();
    return hi() - clear >= 1.5 * half() ? [clear, hi()] : [lo(), hi()];
  }
  const grounded = () => state === 'land' || state === 'idle' || state === 'walk' || state === 'sniff' || state === 'sleep' || state === 'leave';
  const near = () => half() * 0.9 + 6; // close enough to the cursor to sit and look at it

  // where the face is, while it peeks (tree coordinates; the letter's edge is a leaning line)
  function faceBox() {
    const s = world!.stem;
    const w = FW * u;
    const h = FH * u;
    const edge = (y: number) => s.x + s.slope * (y - s.y);
    const top = Math.round(s.cy - h / 2);
    const left = Math.round(edge(s.cy) - COVER * w - faceHide * w * 0.75);
    return { left, top, w, h, edge };
  }

  // the cursor's x while it should be followed, or null
  function attention(): number | null {
    const s = nowS();
    if (s - callAt < ATTENTION) return callX;
    if (ptr.inside && ptr.kind !== 'touch' && s - ptr.at < ATTENTION) return ptr.x;
    return null;
  }

  // ---- little effects -------------------------------------------------------------------------------

  function fx(html: string, cls: string, px: number, py: number, ms: number, vars = '') {
    const el = document.createElement('div');
    el.className = `fx ${cls}`;
    el.style.cssText = `left:${Math.round(px)}px;top:${Math.round(py)}px;--ms:${ms}ms;${vars}`;
    el.innerHTML = html;
    layer.append(el);
    setTimeout(() => el.remove(), ms + 80);
  }

  function puff(cx: number, cy: number, n = 4, spread = 2) {
    for (let i = 0; i < n; i++) {
      const d = document.createElement('i');
      d.className = 'dust';
      const o = (i - (n - 1) / 2) * spread;
      d.style.cssText = `left:${Math.round(cx + o * u * 2)}px;top:${Math.round(cy)}px;width:${u}px;height:${u}px;--dx:${Math.round(o * 7)}px`;
      layer.append(d);
      setTimeout(() => d.remove(), 600);
    }
  }

  function heart(px: number, py: number) {
    const g = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'].map((r) => [...r]);
    const p = pr();
    fx(`<svg width="${7 * p}" height="${6 * p}" viewBox="0 0 7 6">${paths(g, { '#': 'currentColor' })}</svg>`, 'fx-heart', px, py, 1100, `color:var(--rh);--rise:-${14 * p}px`);
  }

  function say(text: string, px: number, py: number) {
    fx(text, 'fx-say', px, py, 1100, '--rise:-8px');
  }

  // ---- state changes --------------------------------------------------------------------------------

  function settle() {
    // standing on the line
    state = 'idle';
    t = 0;
    vy = 0;
    idleFor = rand(0.5, 1.2);
    blinkAt = rand(1, 3);
    happyFor = 0;
    setPose('sit');
  }

  // Scrolling sets it off: a puff, and the face is swapped for the whole dog, which hops and falls to the
  // line (the name is only a few pixels above it on a phone, so a straight drop would be over in a blink).
  function pop() {
    const b = faceBox();
    const cx = b.left + b.w / 2;
    const cy = b.top + b.h / 2;
    puff(cx, cy, 6, 1.4);
    x = cx - HEAD_DX * u;
    feet = cy - HEAD_DY * u + H * u;
    facing = 1;
    state = 'drop';
    t = 0;
    vy = -Math.sqrt(2 * GRAVITY * u * HOP * u);
    quiet = false;
    setPose('fall');
  }

  function land() {
    state = 'land';
    t = 0;
    vy = 0;
    feet = world!.lineY - 1;
    setPose('land');
    if (!view.still && !quiet) puff(x, feet - u * 1.5);
    quiet = false;
  }

  function walk(dir: 1 | -1, dist: number) {
    state = 'walk';
    t = 0;
    facing = dir;
    goal = x + dir * dist;
  }

  // a click on it: a bark and a little hop
  function bark() {
    if (!world) return;
    lastActive = nowS();
    if (state === 'peek') {
      const b = faceBox();
      say('woof!', b.left + b.w / 2, b.top - 4);
      return;
    }
    if (!grounded() || state === 'leave') return;
    say('woof!', x, feet - H * u - 2);
    if (state === 'sleep') { settle(); return; }
    state = 'drop';
    quiet = true;
    t = 0;
    vy = -Math.sqrt(2 * GRAVITY * u * 5 * u);
    setPose('fall');
  }

  // is a pointer at (cx, cy) on the dog (or its face)?
  function hit(cx: number, cy: number) {
    if (!world || !onScreen()) return false;
    const ty = cy + view.scrollY - view.treeTop;
    if (state === 'peek') {
      const b = faceBox();
      return cx >= b.left && cx <= b.left + b.w && ty >= b.top && ty <= b.top + b.h && cx >= b.edge(ty);
    }
    if (state === 'away' || state === 'leave') return false;
    return Math.abs(cx - x) <= half() && ty >= feet - H * u && ty <= feet + 4;
  }

  function stamp() {
    const p = paws[ring];
    ring = (ring + 1) % paws.length;
    side = (-side) as 1 | -1;
    const k = pr();
    p.x = x - facing * 1.5 * u;
    p.y = world!.lineY + side * Math.round(PAW_H * k * 0.22);
    p.at = travel;
    p.o = -1;
    p.el.style.left = `${Math.round(p.x - (PAW_W * k) / 2)}px`;
    p.el.style.top = `${Math.round(p.y - (PAW_H * k) / 2)}px`;
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

  // ---- the loop -------------------------------------------------------------------------------------

  function stepPeek() {
    const s = nowS();
    faceHide = 1 - easeOut((t - PEEK_AFTER) / PEEK_RISE);
    const b = faceBox();
    const fx0 = b.left + b.w / 2;
    const fy0 = b.top + b.h / 2;
    let tongue = false;
    if (ptr.inside && ptr.kind !== 'touch' && s - ptr.at < 6) {
      // eyes follow the cursor; tongue out when it comes close
      const dx = ptr.x - fx0;
      const dy = ptr.y + view.scrollY - view.treeTop - fy0;
      look.ex = dx > 8 * u ? 1 : dx < -8 * u ? -1 : 0;
      look.ey = dy > 10 * u ? 1 : dy < -10 * u ? -1 : 0;
      tongue = Math.hypot(dx, dy) < 18 * u;
    } else if (t > glanceAt) {
      // nobody about: look around a little
      look.ex = [-1, 0, 0, 1][Math.floor(Math.random() * 4)] as -1 | 0 | 1;
      look.ey = Math.random() < 0.3 ? 1 : 0;
      glanceAt = t + rand(1.8, 4.2);
    }
    let blink = false;
    if (t > blinkAt) {
      blink = true;
      if (t > blinkAt + 0.14) { blink = false; blinkAt = t + rand(2.2, 4.5); }
    }
    let ear = false;
    if (t > earAt) {
      ear = true;
      if (t > earAt + 0.45) { ear = false; earAt = t + rand(5, 9); }
    }
    setFace({ ex: look.ex, ey: look.ey, blink, tongue, ear });
  }

  function step(dt: number) {
    t += dt;
    const w = world!;
    const s = nowS();

    if (state === 'peek') { stepPeek(); return; }

    if (state === 'drop') {
      vy += GRAVITY * u * dt;
      feet += vy * dt;
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

    const want = attention();

    if (state === 'land') {
      if (t > 0.18) settle();
    } else if (state === 'sleep') {
      // curled up; z's drift up. Anything at all wakes it.
      setPose('lie');
      if (s >= nextZ) { nextZ = s + 1.3; fx('z', 'fx-z', x + half() * 0.7, feet - H * u * 0.45, 1500, '--rise:-22px;--drift:10px'); }
      if (want !== null || s - lastActive < 0.4) settle();
    } else if (state === 'sniff') {
      setPose(Math.floor(t / 0.2) % 2 ? 'sniff1' : 'sniff0');
      if (want !== null || t > 1.3) { state = 'idle'; t = 0; idleFor = rand(0.4, 1); }
    } else if (state === 'idle') {
      const d = want === null ? 0 : want - x;
      if (want !== null && Math.abs(d) <= near()) {
        // someone is right here: sit and look at them, tongue out, tail going
        if (Math.abs(d) > 3) facing = d >= 0 ? 1 : -1;
        happyFor += dt;
        setPose(Math.floor(t / 0.14) % 2 ? 'happyA' : 'happyB');
        if (happyFor > 1.4 && s >= nextHeart) { nextHeart = s + 1.3; heart(x + facing * half() * 0.2, feet - H * u - 2); }
      } else {
        happyFor = 0;
        if (t > blinkAt) { setPose('sitBlink'); if (t > blinkAt + 0.14) { blinkAt = t + rand(2, 4); } }
        else setPose(Math.floor(t / 0.4) % 2 ? 'wagA' : 'sit');
        if (want !== null) {
          // the cursor is somewhere else on the line: go and see it
          walk(d >= 0 ? 1 : -1, Math.abs(d));
        } else if (s - lastActive > SLEEP_AFTER) {
          state = 'sleep';
          t = 0;
          nextZ = s + 0.6;
        } else if (t > idleFor) {
          const [a, b] = zone();
          let dir: 1 | -1;
          let dist: number;
          if (x < a - 1) {
            // not in its stretch yet (it landed under the name): head for it
            dir = 1;
            dist = Math.min(b - x, a - x + rand(4, 16) * u);
          } else {
            dir = Math.random() < 0.5 ? 1 : -1;
            const room = (dd: number) => (dd > 0 ? b - x : x - a);
            if (room(dir) < 10 * u) dir = (-dir) as 1 | -1;
            dist = Math.min(room(dir), rand(14, 40) * u);
          }
          if (dist < 2 * u) { t = 0; idleFor = 1; return; }
          walk(dir, dist);
          idleFor = rand(0.7, 1.8);
        }
      }
    } else if (state === 'walk') {
      const follow = want !== null;
      const [a, b] = follow ? [lo(), hi()] : zone();
      if (follow) {
        goal = clamp(want!, Math.min(a, b), Math.max(a, b));
        facing = goal >= x ? 1 : -1;
      }
      const outside = x < a - 0.5; // left of its stretch: under the name, or just coming in from the edge
      if (outside && facing < 0) { state = 'idle'; t = 0; return; } // never walks further out
      const run = follow && Math.abs(goal - x) > 5 * half();
      const from = x;
      x += facing * (run ? 26 : 14) * u * dt;
      const arrived = follow ? Math.abs(goal - x) <= near() * 0.7 : facing > 0 ? x >= goal : x <= goal;
      if (!outside) x = Math.max(x, a);
      x = Math.min(x, b);
      travel += Math.abs(x - from);
      setPose(WALK[Math.floor(t / (run ? 0.08 : 0.12)) % WALK.length]);
      if (travel - stampedAt >= PRINT_GAP * u) { stampedAt = travel; stamp(); }
      if (arrived || (!outside && x <= a && !follow) || x >= b) {
        // having got somewhere it sometimes stops for a sniff
        if (!follow && Math.random() < 0.35) { state = 'sniff'; t = 0; }
        else { state = 'idle'; t = 0; blinkAt = rand(1, 3); idleFor = rand(0.5, 1.4); }
      }
    }
  }

  function render() {
    if (!world || !art) return;
    const w = world;

    if (state === 'peek') {
      const b = faceBox();
      feet = b.top + b.h;
      x = b.left + b.w / 2 - HEAD_DX * u;
      const tr = `translate(${b.left}px, ${b.top}px)`;
      if (tr !== shown.faceTr) { shown.faceTr = tr; face.style.transform = tr; }
      // the letter in front of it is a leaning edge: cut the face along it
      const tx = clamp(b.edge(b.top) - b.left, 0, b.w);
      const bx = clamp(b.edge(b.top + b.h) - b.left, 0, b.w);
      const clip = tx <= 0 && bx <= 0 ? '' : `polygon(${tx}px 0, ${b.w}px 0, ${b.w}px ${b.h}px, ${bx}px ${b.h}px)`;
      if (clip !== shown.faceClip) { shown.faceClip = clip; face.style.clipPath = clip; }
      const fv = tx >= b.w && bx >= b.w ? 'hidden' : '';
      if (fv !== shown.faceVis) { shown.faceVis = fv; face.style.visibility = fv; }
      if (shown.vis !== 'hidden') { shown.vis = 'hidden'; dog.style.visibility = 'hidden'; }
      return;
    }

    if (shown.faceVis !== 'hidden') { shown.faceVis = 'hidden'; face.style.visibility = 'hidden'; }
    if (!pose) setPose(state === 'drop' ? 'fall' : state === 'land' ? 'land' : state === 'sleep' ? 'lie' : 'sit'); // after a rebuild
    if (grounded()) feet = w.lineY - 1;

    const left = Math.round(x - half());
    const topY = Math.round(feet - H * u);
    const tr = `translate(${left}px, ${topY}px)`;
    if (tr !== shown.tr) { shown.tr = tr; dog.style.transform = tr; }

    const flip = facing;
    if (flip !== shown.flip) { shown.flip = flip; art.style.transform = flip < 0 ? 'scaleX(-1)' : ''; }

    const vis = state === 'away' ? 'hidden' : '';
    if (vis !== shown.vis) { shown.vis = vis; dog.style.visibility = vis; }

    // in front of the name once it has popped out from behind it; fading as it nears the fixed top bar
    const z = '12';
    if (z !== shown.z) { shown.z = z; dog.style.zIndex = z; }
    const vyTop = view.treeTop + feet - view.scrollY;
    const op = clamp((vyTop - 28) / 36);
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

  // ---- input ----------------------------------------------------------------------------------------

  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return; // a finger dragging is a scroll
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    ptr.kind = e.pointerType;
    ptr.inside = true;
    ptr.at = lastActive = nowS();
    wake();
  }, { passive: true });
  document.addEventListener('mouseleave', () => { ptr.inside = false; });
  // a click or tap on it barks; anywhere else, it comes to see (that is how a phone calls it)
  addEventListener('click', (e) => {
    lastActive = nowS();
    if (hit(e.clientX, e.clientY)) bark();
    else if (world && onScreen()) { callAt = lastActive; callX = e.clientX; }
    wake();
  }, { passive: true });
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
      if (v.scrollY !== view.scrollY) lastActive = nowS();
      view = v;
      if (!world) return;
      const inFront = () => clamp(world!.nameEnd + 8 + half(), lo(), Math.max(lo(), hi()));
      if (!started) {
        started = true;
        glanceAt = 1.5;
        blinkAt = PEEK_AFTER + PEEK_RISE + rand(1, 2.5);
        earAt = PEEK_AFTER + PEEK_RISE + rand(3, 6);
        if (v.scrollY > TRIGGER) {
          // reloaded part-way down: it is simply there, on the line
          x = inFront();
          feet = world.lineY - 1;
          settle();
          if (!fits()) state = 'away';
        } else {
          state = 'peek';
          faceHide = v.still ? 0 : 1;
          setFace({});
        }
      } else if (state === 'peek' && v.scrollY > TRIGGER) {
        if (v.still) {
          // no motion: it is just sitting there on the line
          x = inFront();
          feet = world.lineY - 1;
          settle();
        } else {
          pop();
        }
      }
      if (v.still && state !== 'peek') {
        if (!fits()) state = 'away';
        else {
          if (state === 'away') settle();
          const [a, b] = zone();
          x = clamp(x, Math.min(a, b), Math.max(a, b));
          if (state !== 'idle') settle();
        }
      }
      // draw straight away so there is never a frame with the dog unplaced; the loop takes over from here
      render();
      fadePaws();
      wake();
    },
  };
}
