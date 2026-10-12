// The pup's hop arithmetic, with the DOM and the dog's state taken out so it can be tested: where a leap goes,
// where it is at time t, and which platform is worth hopping to. pup.ts supplies the numbers (where the dog is,
// how the page is scrolled) and owns the state machine; nothing here reads a global.
//
// "Platform" means what pup.ts means by it: index 0 is the hero line, index i > 0 is the i-th card, top to
// bottom. Heights are in tree coordinates unless a name says "window".

import { H, W } from './pup-art';

export const GRAVITY = 520; // px/s² per px of art pixel, so a small dog on a phone falls as slowly as it looks
export const BAR = 56; // px: the fixed top bar (BAR_H in graph.ts)
export const LEAP_RISE = 6; // art pixels it clears the higher end of a hop by...
export const LEAP_ARC = 8; // ...plus a little more the further across it goes, up to this
export const LEAP_G = 1.5; // a hop is quicker than a plain fall: it pushes off, and the page won't wait

export const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** Gravity during a hop, px/s². */
export const leapGravity = (unit: number) => GRAVITY * LEAP_G * unit;

/** A sprite's size in art pixels; the dog's (pup-art's W and H) unless a taller or wider one is given. */
export interface SpriteSize {
  w: number;
  h: number;
}
const DOG: SpriteSize = { w: W, h: H };

/** Is y (in the window) somewhere good to land: far enough from the bar and the bottom that all of the dog is seen below the bar? */
export const comfy = (y: number, unit: number, height: number, sprite: SpriteSize = DOG) =>
  y >= BAR + sprite.h * unit + 8 && y <= height - 56;

export const FLY_BASE = 0.4; // s a flight takes however short it is: it has to take off and land...
export const FLY_SPEED = 420; // ...plus the distance at this many px/s

/**
 * A hop, ballistic: from (x0, y0) to (x1, y1), launched at vy0 (negative is up), taking T seconds; `top` is the
 * y of its apex. A flight (`h` is set; vy0 is 0) is flown instead: eased from one end to the other with a lift of
 * `h` px in the middle, so it never gets above `top` either.
 */
export interface Arc {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  vy0: number;
  T: number;
  top: number;
  h?: number;
}

/** The part of the page's state a hop depends on. */
export interface ArcFrame {
  unit: number; // px per art pixel
  scrollY: number;
  treeTop: number;
  width: number; // viewport width
  height: number; // viewport height
  sprite?: SpriteSize; // default: the dog's
  fly?: boolean; // it flies (wings and all) rather than hops
}

/**
 * The arc for a hop from (x, feet) to x1 on a platform whose top is at y1, in tree coordinates, so scrolling
 * while it is in the air doesn't change it. It rises a little above the higher end, more the further it has to
 * go sideways. From a long way out of the window (a fast flick, or when it is away) it starts from just
 * outside the window instead, which looks like dropping in from above (or leaping up from below). `rand`
 * picks where it comes in from in that case.
 */
export function planArc(
  f: ArcFrame,
  x: number,
  feet: number,
  y1: number,
  x1: number,
  outside: boolean,
  rand: (lo: number, hi: number) => number,
): Arc {
  const u = f.unit;
  const g = leapGravity(u);
  const { w: sw, h: sh } = f.sprite ?? DOG;
  const half = (sw * u) / 2;
  const winTop = f.scrollY - f.treeTop; // tree y of the top of the window
  const winBottom = winTop + f.height;
  let x0 = x;
  let y0 = feet;
  if (outside || y0 < winTop - sh * u - 40) {
    y0 = winTop - sh * u - 24;
    x0 = clamp(x1 + rand(-70, 70), half + 2, Math.max(half + 2, f.width - half - 2));
  } else if (y0 - sh * u > winBottom + 40) {
    y0 = winBottom + sh * u + 24;
  }
  const top = Math.min(y0, y1) - (LEAP_RISE * u + Math.min(0.06 * Math.abs(x1 - x0), LEAP_ARC * u));
  if (f.fly) {
    const T = FLY_BASE + Math.hypot(x1 - x0, y1 - y0) / FLY_SPEED;
    return { x0, y0, x1, y1, vy0: 0, T, top, h: Math.min(y0, y1) - top };
  }
  const vy0 = -Math.sqrt(2 * g * (y0 - top));
  const T = -vy0 / g + Math.sqrt((2 * (y1 - top)) / g);
  return { x0, y0, x1, y1, vy0, T, top };
}

/**
 * Where a hop has got to after t seconds (it stays at the landing from T on): the closed form rather than
 * an integration, so it comes down exactly where it was aimed.
 */
export function arcAt(arc: Pick<Arc, 'x0' | 'y0' | 'x1' | 'vy0' | 'T'> & Partial<Pick<Arc, 'y1' | 'h'>>, t: number, unit: number) {
  const k = Math.min(t, arc.T);
  if (arc.h !== undefined && arc.y1 !== undefined) {
    // a flight: leaves gently and arrives gently (a half cosine), with a lift in the middle of it
    const s = k / arc.T;
    const e = 0.5 - 0.5 * Math.cos(Math.PI * s);
    const de = (0.5 * Math.PI * Math.sin(Math.PI * s)) / arc.T;
    return {
      feet: arc.y0 + (arc.y1 - arc.y0) * e - arc.h * Math.sin(Math.PI * e),
      x: arc.x0 + (arc.x1 - arc.x0) * e,
      vy: (arc.y1 - arc.y0 - arc.h * Math.PI * Math.cos(Math.PI * e)) * de,
    };
  }
  const g = leapGravity(unit);
  return {
    feet: arc.y0 + arc.vy0 * k + 0.5 * g * k * k,
    x: arc.x0 + (arc.x1 - arc.x0) * (k / arc.T),
    vy: arc.vy0 + g * k,
  };
}

/** What pickSpot needs to know. */
export interface SpotQuery {
  count: number; // how many cards there are: the platforms are 0 (the line) to count
  perch: number; // the platform it stands on
  unit: number;
  height: number; // viewport height
  treeTop: number;
  scrollY: number;
  live(i: number): boolean; // can it stand on platform i (a card is only there while it is revealed)
  windowY(i: number): number; // where platform i's top is in the window
  plan(i: number): { T: number; top: number }; // the hop to platform i (planArc's T and top)
  speed(): number; // how fast the page is being scrolled, px/s, + going down; 0 if it has stopped
  sprite?: SpriteSize; // default: the dog's
}

/**
 * The platform to hop to, among those it can land on in the window: the one that will be nearest 40% of the
 * way down it (so the longest in view, and nowhere near being put away again). dir 1 looks at the ones after
 * the one it stands on, dir -1 at those before it (and, with `any`, falls back on the nearest one that is
 * revealed at all), dir 0 at all of them. -1 if there is none.
 */
export function pickSpot(q: SpotQuery, dir: 1 | -1 | 0, any = false): number {
  const n = q.count;
  const sprite = q.sprite ?? DOG;
  const want = Math.max(BAR + sprite.h * q.unit + 60, q.height * 0.4);
  let best = -1;
  let bestD = Infinity;
  const [from, to] = dir > 0 ? [q.perch + 1, n] : dir < 0 ? [0, q.perch - 1] : [0, n];
  for (let i = from; i <= to; i++) {
    if (!q.live(i)) continue;
    const p = q.plan(i);
    // where it will be in the window by the time it gets there, given how fast the page is moving, and
    // (hopping up) that the top of the arc stays out from under the bar
    const y = q.windowY(i) - q.speed() * p.T;
    if (!comfy(y, q.unit, q.height, sprite) || (dir < 0 && q.treeTop + p.top - q.scrollY < BAR - 16)) continue;
    const d = Math.abs(y - want);
    if (d < bestD) { best = i; bestD = d; }
  }
  if (best < 0 && any) {
    // Nothing is comfortable. That happens at the very bottom of the page, where the last card's top is too
    // close to the bar for all of a tall pet to be seen under it. A pet that is out of sight is worse off than
    // one with its head under the bar, so settle for the lowest platform that is in the window at all.
    let lowest = -Infinity;
    for (let i = from; i <= to; i++) {
      if (!q.live(i)) continue;
      const y = q.windowY(i) - q.speed() * q.plan(i).T;
      if (y >= BAR + 8 && y <= q.height - 8 && y > lowest) { lowest = y; best = i; }
    }
  }
  if (best < 0 && any && dir < 0) for (let i = q.perch - 1; i >= 0 && best < 0; i--) if (q.live(i)) best = i;
  return best;
}
