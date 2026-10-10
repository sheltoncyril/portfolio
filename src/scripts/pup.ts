// An 8-bit pup that lives on the hero line. It starts out hiding behind the last letter of the name with
// only its face showing, pops out when the page is scrolled, drops onto the line and wanders along it,
// leaving paw prints that fade as it walks on. It follows the cursor (or the last tap), gets excited when
// you hover close, naps when nobody is paying attention and barks if you click it. As the page scrolls it
// hops from the line onto the project cards, and from card to card, to stay in the window.
//
// Pure decoration: aria-hidden, no pointer events of its own, and the page is complete without it. graph.ts
// owns the geometry: it calls layout() when the tree is rebuilt and sync() on every paint. This module owns
// the little state machine and its animation loop; the pixel art is in pup-art.ts.
//
// It stands on a "platform": index 0 is the hero line, index i > 0 is the i-th card, in document order, which
// is top to bottom.

import { COLORS, paths, POSES, WALK, RUN, drawBody, drawFace, type FaceOpts, W, H, FW, FH, PAW_GRID, PAW_W, PAW_H } from './pup-art';

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
const TROT = 18; // px/s per px of art pixel: its walking speed...
const SPRINT = 52; // ...and how fast it runs when the cursor is a way off
const TEETER = 1.5; // s it spends wobbling on an edge
const WARY = 10; // s after a scare that it keeps a few steps back from the edge
const EDGE_SAFE = 8; // art pixels it stays back by while wary
const CARD_INSET = 6; // art pixels in from a card's edge that its centre may go: past that it teeters
const BAR = 56; // px: the fixed top bar (BAR_H in graph.ts)
const TOP_EDGE = 90; // px from the top of the window: with its feet this high (or higher) it hops further down...
const BOTTOM_EDGE = 40; // ...and with them this close to the bottom (or lower) it hops further up
const LEAP_COOLDOWN = 0.6; // s after a landing before scrolling can set it off again
const LEAP_RISE = 6; // art pixels it clears the higher end of a hop by...
const LEAP_ARC = 8; // ...plus a little more the further across it goes, up to this
const LEAP_G = 1.5; // a hop is quicker than a plain fall: it pushes off, and the page won't wait
const DIVE_FLAP = 0.08; // s each frame of the skydive is held for

export interface PupStem {
  x: number; // the right-hand edge of the letter it hides behind, at height y...
  y: number;
  slope: number; // ...and how far that edge moves for each px of height (italic letters lean)
  cy: number; // height the face sits at
}
/** A project card the dog can stand on, in tree coordinates (the box is the card's layout box, without its reveal transform). */
export interface PupCard {
  x: number;
  y: number; // the top edge: where its feet go
  w: number;
  h: number;
  el: HTMLElement; // the .entry; it has the class `in` while its card is revealed
}
export interface PupWorld {
  lineY: number; // y of the hero line's centre, in tree coordinates
  endRest: number; // x where the line turns down into the trunk once the tree is in place
  nameEnd: number; // x of the right edge of the name; the dog keeps clear of it when there is open line beside it
  unit: number; // px per art pixel
  stem: PupStem;
  cards: PupCard[]; // top to bottom
}
export interface PupView {
  scrollY: number;
  treeTop: number;
  dx: number; // how far the tree is still translated to the right (the line's end moves with it)
  width: number; // viewport width; the line runs past it while the tree is still sliding in
  still: boolean; // prefers-reduced-motion
}

// leave: running out of the left edge because the line has become too short to stand on (and there is no
// card to hop to); away: gone, until there is somewhere to stand again
// teeter: wobbling on the edge of the line or a card, trying not to fall off
// leap: in the air between two platforms
type State = 'peek' | 'drop' | 'land' | 'idle' | 'walk' | 'sniff' | 'sleep' | 'teeter' | 'leave' | 'away' | 'leap';

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
  // card: the card a print was left on (null: the line), so it goes when that card is put away
  let paws: { el: SVGSVGElement; x: number; y: number; at: number; o: number; card: HTMLElement | null }[] = [];

  let state: State = 'peek';
  let started = false;
  let t = 0; // seconds spent in the current state
  let x = 0; // centre of the body sprite
  let feet = 0; // bottom edge of the body sprite
  let vy = 0;
  let vx = 0; // sideways speed while it is in the air (hopping back from an edge)
  // The platform it stands on (0: the line, i > 0: the i-th card) and the one it is leaping to. The elements
  // are what it really stands on; the indices are re-found from them whenever the cards are measured again.
  let perch = 0;
  let perchEl: HTMLElement | null = null;
  let dest = 0;
  let destEl: HTMLElement | null = null;
  // the arc of the current leap, in tree coordinates: from (x0, y0) to (x1, y1), launched at vy0, taking T s
  let arc = { x0: 0, y0: 0, x1: 0, y1: 0, vy0: 0, T: 1 };
  let readyAt = 0; // earliest time scrolling may set off another leap
  let scrollV = 0; // smoothed scroll speed, px/s (+ going down), as of the time scrollAt
  let scrollAt = -1e9;
  let facing: 1 | -1 = 1;
  let quiet = false; // landing from a hop in place rather than a fall: no puff
  let phew = false; // say so once it is back on its feet
  let waryUntil = 0;
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
      return { el, x: 0, y: 0, at: -1e9, o: 0, card: null };
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

  // Platform i: 0 is the line, i > 0 is card i - 1. Where its feet go, and the stretch its centre may be on.
  const card = (i: number) => world!.cards[i - 1];
  const floorOf = (i: number) => (i > 0 ? card(i).y : world!.lineY - 1);
  // Along the line the sprite's left edge stays on screen...
  const loOf = (i: number) => (i > 0 ? card(i).x + CARD_INSET * u : half() + 2);
  // ...and so does its right edge, with its snout over the line (the line runs past the screen's edge
  // while the tree is still sliding in). On a card it can go as far as its front paws at the edge.
  const hiOf = (i: number) =>
    i > 0 ? card(i).x + card(i).w - CARD_INSET * u : Math.min(lineEnd() - half(), view.width - half() - 2);
  // can a dog stand on it at all? On a phone the line is only a short stub once the tree is in place.
  const fitsOf = (i: number) => hiOf(i) - loOf(i) >= 2 * u;
  const floorY = () => floorOf(perch);
  const lo = () => loOf(perch);
  const hi = () => hiOf(perch);
  const fits = () => fitsOf(perch);
  // The stretch it wanders on. Where there is open line beside the name it keeps clear of the name (on a
  // phone the dog is nearly as tall as the name, so standing under it hides the logo); otherwise the whole
  // line, or the whole of a card. When it is following the cursor it may go anywhere on the platform.
  function zone(): [number, number] {
    if (perch > 0) return [lo(), hi()];
    const clear = world!.nameEnd + 8 + half();
    return hi() - clear >= 1.5 * half() ? [clear, hi()] : [lo(), hi()];
  }
  const grounded = () =>
    state === 'land' || state === 'idle' || state === 'walk' || state === 'sniff' || state === 'sleep' || state === 'teeter' || state === 'leave';

  // ---- platforms ------------------------------------------------------------------------------------

  const indexOf = (el: HTMLElement | null) => (el && world ? world.cards.findIndex((c) => c.el === el) + 1 : 0);
  function stand(i: number) {
    perch = i;
    perchEl = i > 0 ? card(i).el : null;
  }
  // somewhere to stand: the line while it is long enough, a card while it is revealed (before that it is
  // invisible; it is put away again when you scroll back up)
  const live = (i: number) => (i > 0 ? card(i).el.classList.contains('in') : fitsOf(0));
  // where the platform's top is in the window
  const windowY = (i: number) => view.treeTop + floorOf(i) - view.scrollY;
  // how fast the page is being scrolled (px/s, positive going down); nothing if it has stopped
  const scrollSpeed = () => (nowS() - scrollAt > 0.12 ? 0 : scrollV);
  // Is y (in the window) somewhere good to land: far enough from the bar and the bottom that all of the dog
  // is seen below the bar?
  const comfy = (y: number) => y >= BAR + H * u + 8 && y <= innerHeight - 56;
  // The platform to hop to, among those it can land on in the window: the one that will be nearest 40% of the
  // way down it (so the longest in view, and nowhere near being put away again). dir 1 looks at the ones
  // after the one it stands on, dir -1 at those before it (and, with `any`, falls back on the nearest one
  // that is revealed at all), dir 0 at all of them. -1 if there is none.
  function pickSpot(dir: 1 | -1 | 0, any = false): number {
    const n = world!.cards.length;
    const want = Math.max(BAR + H * u + 60, innerHeight * 0.4);
    let best = -1;
    let bestD = Infinity;
    const [from, to] = dir > 0 ? [perch + 1, n] : dir < 0 ? [0, perch - 1] : [0, n];
    for (let i = from; i <= to; i++) {
      if (!live(i)) continue;
      const p = planArc(i, aimX(i, 0.5), state === 'away');
      // where it will be in the window by the time it gets there, given how fast the page is moving, and
      // (hopping up) that the top of the arc stays out from under the bar
      const y = windowY(i) - scrollSpeed() * p.T;
      if (!comfy(y) || (dir < 0 && view.treeTop + p.top - view.scrollY < BAR - 16)) continue;
      const d = Math.abs(y - want);
      if (d < bestD) { best = i; bestD = d; }
    }
    if (best < 0 && any && dir < 0) for (let i = perch - 1; i >= 0 && best < 0; i--) if (live(i)) best = i;
    return best;
  }
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

  // a little dust kicked up behind it while it runs
  let nextKick = 0;
  function kick(s: number) {
    if (s < nextKick || view.still) return;
    nextKick = s + 0.11;
    const d = document.createElement('i');
    d.className = 'dust';
    d.style.cssText = `left:${Math.round(x - facing * half() * 0.7)}px;top:${Math.round(feet - u * 2)}px;width:${u}px;height:${u}px;--dx:${-facing * 9}px`;
    layer.append(d);
    setTimeout(() => d.remove(), 600);
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
    // standing on the line (or a card)
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
    vx = 0;
    quiet = false;
    stand(0);
    setPose('fall');
  }

  function land() {
    state = 'land';
    t = 0;
    vy = 0;
    vx = 0;
    feet = floorY();
    setPose('land');
    if (!view.still && !quiet) puff(x, feet - u * 1.5);
    if (phew) say('phew', x, feet - H * u - 2);
    quiet = false;
    phew = false;
  }

  // Wobbled on the edge long enough: it rocks back, turns round and hops away from it, and for a while
  // after that keeps a few steps back.
  function recover() {
    facing = (-facing) as 1 | -1;
    state = 'drop';
    t = 0;
    quiet = true;
    phew = true;
    vy = -Math.sqrt(2 * GRAVITY * u * 5 * u);
    vx = facing * 20 * u;
    waryUntil = nowS() + WARY;
    setPose('fall');
  }

  function walk(dir: 1 | -1, dist: number) {
    state = 'walk';
    t = 0;
    facing = dir;
    goal = x + dir * dist;
  }

  // where on platform j to land, `f` of the way across the middle of it (cards: the middle 40%)
  function aimX(j: number, f: number) {
    if (j > 0) {
      const c = card(j);
      return clamp(c.x + c.w * (0.3 + 0.4 * f), loOf(j), Math.max(loOf(j), hiOf(j)));
    }
    const a = loOf(0);
    return a + Math.max(0, hiOf(0) - a) * (0.2 + 0.6 * f);
  }

  // The arc for a hop to x1 on platform j, ballistic and in tree coordinates, so scrolling while it is in the
  // air doesn't change it. It rises a little above the higher end, more the further it has to go sideways.
  // From a long way out of the window (a fast flick, or when it is away) it starts from just outside the
  // window instead, which looks like dropping in from above (or leaping up from below).
  function planArc(j: number, x1: number, outside: boolean) {
    const g = GRAVITY * LEAP_G * u;
    const winTop = view.scrollY - view.treeTop; // tree y of the top of the window
    const winBottom = winTop + innerHeight;
    let x0 = x;
    let y0 = feet;
    if (outside || y0 < winTop - H * u - 40) {
      y0 = winTop - H * u - 24;
      x0 = clamp(x1 + rand(-70, 70), half() + 2, Math.max(half() + 2, view.width - half() - 2));
    } else if (y0 - H * u > winBottom + 40) {
      y0 = winBottom + H * u + 24;
    }
    const y1 = floorOf(j);
    const top = Math.min(y0, y1) - (LEAP_RISE * u + Math.min(0.06 * Math.abs(x1 - x0), LEAP_ARC * u));
    const vy0 = -Math.sqrt(2 * g * (y0 - top));
    const T = -vy0 / g + Math.sqrt((2 * (y1 - top)) / g);
    return { x0, y0, x1, y1, vy0, T, top };
  }

  // Hop to platform j.
  function leapTo(j: number, fromOutside = false) {
    arc = planArc(j, aimX(j, Math.random()), fromOutside);
    x = arc.x0;
    feet = arc.y0;
    dest = j;
    destEl = j > 0 ? card(j).el : null;
    const dx = arc.x1 - x;
    if (Math.abs(dx) > 4) facing = dx >= 0 ? 1 : -1;
    state = 'leap';
    t = 0;
    vx = 0;
    vy = arc.vy0;
    quiet = false;
    phew = false;
    setPose('run0');
    if (!fromOutside && !view.still) puff(x, feet - u * 1.5, 3, 1.2);
  }

  function stepLeap() {
    const g = GRAVITY * LEAP_G * u;
    const k = Math.min(t, arc.T);
    // the closed form rather than integrating, so it comes down exactly where it was aimed
    feet = arc.y0 + arc.vy0 * k + 0.5 * g * k * k;
    x = arc.x0 + (arc.x1 - arc.x0) * (k / arc.T);
    vy = arc.vy0 + g * k;
    // a gallop's stretch going up; coming down it skydives, legs out to the sides and ears blown up, which
    // flutter between two frames
    setPose(vy < 0 ? 'run0' : Math.floor(t / DIVE_FLAP) % 2 ? 'diveB' : 'diveA');
    if (t < arc.T) return;
    stand(dest);
    x = clamp(x, lo(), Math.max(lo(), hi()));
    land();
    // a pause so it doesn't chain-hop, unless scrolling has already carried the platform out of the window
    // while it was in the air: then it should hop on at once
    const y = windowY(perch);
    readyAt = nowS() + (y < TOP_EDGE || y > innerHeight - BOTTOM_EDGE ? 0.1 : LEAP_COOLDOWN);
  }

  // Scrolling has taken the platform it stands on out of the window (or put it away under its feet): hop to
  // another one. Returns true if it did something about it.
  function considerLeap(s: number): boolean {
    if (view.still || state === 'land') return false;
    const winY = view.treeTop + floorY() - view.scrollY; // where its feet are in the window
    const gone = perch > 0 && !live(perch);
    let dir: 1 | -1;
    if (gone) dir = -1;
    else if (s < readyAt && winY > BAR + 8) return false; // not again so soon, unless it is about to go under the bar
    else if (winY < TOP_EDGE + (LEAP_RISE + LEAP_ARC) * u) dir = 1;
    else if (winY > innerHeight - BOTTOM_EDGE) dir = -1;
    else return false;
    const j = pickSpot(dir, gone);
    if (j >= 0) {
      if (!gone && dir > 0) {
        // it sets off early enough that the top of the arc is still below the bar, not under it
        const p = planArc(j, aimX(j, 0.5), false);
        if (view.treeTop + p.top - view.scrollY >= TOP_EDGE) return false;
      }
      leapTo(j);
      return true;
    }
    if (gone) {
      // its card is put away and there is nothing above it to stand on: it vanishes in a puff, and comes back
      // when there is somewhere to be
      puff(x, feet - (H * u) / 2, 6, 1.4);
      state = 'away';
      t = 0;
      return true;
    }
    return false;
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
    p.y = floorY() + 1 + side * Math.round(PAW_H * k * 0.22);
    p.card = perchEl;
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
      // the line has been pulled back from under it (or its card put away)
      const away = p.card ? !p.card.classList.contains('in') : p.x > end - 2;
      const o = away ? 0 : Math.ceil(clamp(1 - (travel - p.at) / life) * 4) / 4;
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
    const s = nowS();

    if (state === 'peek') { stepPeek(); return; }

    if (state === 'drop') {
      vy += GRAVITY * u * dt;
      feet += vy * dt;
      if (vx) x = clamp(x + vx * dt, lo(), Math.max(lo(), hi()));
      if (vy > 0 && feet >= floorY()) land();
      return;
    }

    if (state === 'leap') { stepLeap(); return; }

    // on the line (or a card) from here on
    feet = floorY();

    if (state === 'away') {
      // back once there is somewhere to stand in the window: on the line (scrolled back to the top, so it is
      // long enough again) it walks in from the left edge; on a card it drops in from above
      const j = pickSpot(0);
      if (j < 0) return;
      if (j > 0) { leapTo(j, true); return; }
      stand(0);
      x = -half() - 2;
      state = 'walk';
      facing = 1;
      goal = zone()[0] + rand(6, 14) * u;
      t = 0;
    } else if (perch === 0 && !fits() && state !== 'leave') {
      // The tree has slid in and left only a stub of line. It hops to the first card if one is there to land
      // on; otherwise it runs out of the left edge rather than hang half off the screen.
      const j = pickSpot(1);
      if (j > 0 && !view.still) { leapTo(j); return; }
      state = 'leave';
      facing = -1;
      t = 0;
    }

    if (state === 'leave') {
      x -= SPRINT * 0.8 * u * dt;
      travel += SPRINT * 0.8 * u * dt;
      setPose(RUN[Math.floor(t / 0.07) % RUN.length]);
      kick(s);
      if (x <= -half() - 2) { state = 'away'; t = 0; }
      return;
    }

    const top = hi();
    if (perch > 0) {
      // a card doesn't move under it, except when the page is laid out again
      x = clamp(x, lo(), Math.max(lo(), top));
    } else if (x > top) {
      // the line is being pulled in from under the dog (the tree slides in as you scroll): it keeps its
      // footing and trots along ahead of the end
      const from = x;
      x = top;
      if (state !== 'walk' || facing > 0) { state = 'walk'; facing = -1; goal = x - 6 * u; t = 0; }
      travel += Math.abs(from - x);
    }

    if (considerLeap(s)) return;

    const want = attention();
    // where it goes to meet the cursor: a few steps short of an edge it has just had a fright at
    const hiSafe = Math.max(lo(), hi() - (s < waryUntil ? EDGE_SAFE * u : 0));
    const aim = want === null ? null : clamp(want, lo(), hiSafe);
    // the cursor is past the end of the line: it can't stop short of it and look, it goes right to the brink
    const beyond = want !== null && aim !== null && Math.abs(want - aim) > 4;
    const reach = beyond ? 1.5 : near();

    if (state === 'land') {
      if (t > 0.18) settle();
    } else if (state === 'teeter') {
      // on the edge: front paws scrabbling, rocking out over it and back
      setPose(Math.floor(t / 0.11) % 2 ? 'teeterB' : 'teeterA');
      if (t > TEETER) recover();
    } else if (state === 'sleep') {
      // curled up; z's drift up. Anything at all wakes it.
      setPose('lie');
      if (s >= nextZ) { nextZ = s + 1.3; fx('z', 'fx-z', x + half() * 0.7, feet - H * u * 0.45, 1500, '--rise:-22px;--drift:10px'); }
      if (want !== null || s - lastActive < 0.4) settle();
    } else if (state === 'sniff') {
      setPose(Math.floor(t / 0.2) % 2 ? 'sniff1' : 'sniff0');
      if (want !== null || t > 1.3) { state = 'idle'; t = 0; idleFor = rand(0.4, 1); }
    } else if (state === 'idle') {
      const d = aim === null ? 0 : aim - x;
      if (aim !== null && Math.abs(d) <= reach) {
        // someone is right here (or as near as it dares go): sit and look at them, tongue out, tail going
        const toward = want! - x;
        if (Math.abs(toward) > 3) facing = toward >= 0 ? 1 : -1;
        happyFor += dt;
        setPose(Math.floor(t / 0.14) % 2 ? 'happyA' : 'happyB');
        if (happyFor > 1.4 && s >= nextHeart) { nextHeart = s + 1.3; heart(x + facing * half() * 0.2, feet - H * u - 2); }
      } else {
        happyFor = 0;
        if (t > blinkAt) { setPose('sitBlink'); if (t > blinkAt + 0.14) { blinkAt = t + rand(2, 4); } }
        else setPose(Math.floor(t / 0.4) % 2 ? 'wagA' : 'sit');
        if (aim !== null) {
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
      const follow = aim !== null;
      const [a, b] = follow ? [lo(), hiSafe] : zone();
      if (follow) {
        goal = clamp(aim!, Math.min(a, b), Math.max(a, b));
        facing = goal >= x ? 1 : -1;
      }
      const outside = x < a - 0.5; // left of its stretch: under the name, or just coming in from the edge
      if (outside && facing < 0) { state = 'idle'; t = 0; return; } // never walks further out
      // a long way to go to meet the cursor: it runs
      const run = follow && Math.abs(goal - x) > 2.5 * half();
      const from = x;
      x += facing * (run ? SPRINT : TROT) * u * dt;
      if (beyond && Math.abs(goal - x) <= 1.5) x = goal; // right to the brink, not a hair short of it
      const arrived = follow ? Math.abs(goal - x) <= (beyond ? 1.5 : near() * 0.7) : facing > 0 ? x >= goal : x <= goal;
      if (!outside) x = Math.max(x, a);
      x = Math.min(x, b);
      travel += Math.abs(x - from);
      if (run) { setPose(RUN[Math.floor(t / 0.07) % RUN.length]); kick(s); }
      else setPose(WALK[Math.floor(t / 0.1) % WALK.length]);
      if (travel - stampedAt >= PRINT_GAP * u) { stampedAt = travel; stamp(); }
      if (arrived || (!outside && x <= a && !follow) || x >= b) {
        // Running into the end of the line (or the edge of the screen, which it treats the same): it
        // skids to a stop and wobbles on the brink. Stopping at the edge of its stretch under the name
        // doesn't count; that isn't an edge.
        const atEdge = !outside && ((facing > 0 && x >= hi() - 0.5) || (facing < 0 && x <= lo() + 0.5));
        if (atEdge && !view.still) {
          state = 'teeter';
          t = 0;
          say('whoa!', x, feet - H * u - 2);
        } else if (!follow && Math.random() < 0.35) {
          // having got somewhere it sometimes stops for a sniff
          state = 'sniff';
          t = 0;
        } else {
          state = 'idle';
          t = 0;
          blinkAt = rand(1, 3);
          idleFor = rand(0.5, 1.4);
        }
      }
    }
  }

  function render() {
    if (!world || !art) return;

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
    if (!pose) setPose(state === 'drop' ? 'fall' : state === 'leap' ? 'diveA' : state === 'land' ? 'land' : state === 'sleep' ? 'lie' : 'sit'); // after a rebuild
    if (grounded()) feet = floorY();

    // rocking on the edge: swings out and back, a bit further each time
    const wobble = state === 'teeter' ? (Math.floor(t / 0.11) % 2 ? -1 : 1) * facing * Math.round(u * (0.5 + t / TEETER)) : 0;
    const left = Math.round(x - half() + wobble);
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
    if (state === 'leap') return true; // it may start from outside the window; it has to come down either way
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
    // Parks while it is out of the window, but not before it has had the chance to decide to come back: for
    // a moment after the page stops moving (its speed has to settle, which no scroll event will announce),
    // and until the pause after a landing is over.
    const s = nowS();
    const deciding = s < Math.max(scrollAt + 0.4, readyAt + 0.05);
    if (!view.still && (onScreen() || deciding) && !document.hidden) raf = requestAnimationFrame(tick);
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
      // the cards are new objects, and may have moved or gone: find the ones it was on and heading for again
      perch = indexOf(perchEl);
      dest = indexOf(destEl);
      if (resized) build();
      if (!started) return;
      render();
      wake();
    },
    /** Called on every paint; cheap. */
    sync(v: PupView) {
      if (v.scrollY !== view.scrollY) {
        const n = nowS();
        lastActive = n;
        // speed between two scroll changes, smoothed over about a tenth of a second
        const dt = n - scrollAt;
        if (dt > 0.002 && dt < 0.25) scrollV += ((v.scrollY - view.scrollY) / dt - scrollV) * Math.min(1, dt / 0.1);
        else if (dt >= 0.25) scrollV = 0;
        scrollAt = n;
      }
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
        stand(0); // no hopping about: it just sits on the line
        feet = floorY();
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
