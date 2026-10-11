import { describe, expect, it } from 'vitest';
import { H, W } from './pup-art';
import { BAR, LEAP_ARC, LEAP_RISE, arcAt, clamp, comfy, leapGravity, pickSpot, planArc, type Arc, type ArcFrame, type SpotQuery } from './pup-math';

const middle = (lo: number, hi: number) => (lo + hi) / 2; // a rand() that always picks the middle of its range

// the page: scrolled 900px into a tree that starts 100px down, in a 1200 x 800 window, 3px per art pixel
const frame = (over: Partial<ArcFrame> = {}): ArcFrame => ({ unit: 3, scrollY: 1000, treeTop: 100, width: 1200, height: 800, ...over });
const winTop = (f: ArcFrame) => f.scrollY - f.treeTop; // tree y of the top of the window

describe('clamp', () => {
  it('limits to [0, 1] unless told otherwise', () => {
    expect([clamp(-1), clamp(0.25), clamp(7)]).toEqual([0, 0.25, 1]);
    expect([clamp(5, 10, 20), clamp(15, 10, 20), clamp(25, 10, 20)]).toEqual([10, 15, 20]);
  });
});

describe('comfy: where in the window is a good place to land', () => {
  const u = 3;
  const lowest = BAR + H * u + 8; // all of the dog is below the bar
  const highest = 800 - 56; // and it is not hard against the bottom

  it('accepts everything between the bar (and the dog under it) and the bottom of the window', () => {
    expect(comfy(lowest, u, 800)).toBe(true);
    expect(comfy(highest, u, 800)).toBe(true);
    expect(comfy(400, u, 800)).toBe(true);
  });

  it('refuses a platform too close to the bar or to the bottom', () => {
    expect(comfy(lowest - 1, u, 800)).toBe(false);
    expect(comfy(highest + 1, u, 800)).toBe(false);
    expect(comfy(-50, u, 800)).toBe(false);
  });

  it('wants more room under the bar for a bigger dog', () => {
    expect(comfy(lowest, 4, 800)).toBe(false);
    expect(comfy(BAR + H * 4 + 8, 4, 800)).toBe(true);
  });
});

describe('planArc: a hop lands exactly on its target, at time T', () => {
  // [name, unit, from x, from feet, target x, target y]; the window is tree y 900..1700
  const hops: [string, number, number, number, number, number][] = [
    ['down to the next card', 3, 300, 1100, 700, 1300],
    ['up to the card above', 3, 700, 1500, 400, 1250],
    ['straight across', 3, 200, 1300, 900, 1300],
    ['straight up, a long way', 3, 600, 1650, 600, 950],
    ['a phone-sized dog', 2, 100, 1000, 250, 1150],
    ['a big dog on a big screen', 5, 100, 1000, 1000, 1500],
    ['one pixel across', 3, 500, 1200, 501, 1200],
  ];
  const f = frame();
  const g = leapGravity(3);

  it.each(hops)('%s', (_, unit, x, feet, x1, y1) => {
    const fr = frame({ unit });
    const arc = planArc(fr, x, feet, y1, x1, false, middle);
    expect(arc.T).toBeGreaterThan(0);
    expect(Number.isFinite(arc.T)).toBe(true);

    // it leaves from where it stood...
    const start = arcAt(arc, 0, unit);
    expect([start.x, start.feet]).toEqual([x, feet]);
    expect(start.vy).toBeLessThan(0); // ...going up
    // ...and at time T it is on its target, coming down
    const end = arcAt(arc, arc.T, unit);
    expect(end.x).toBeCloseTo(x1, 6);
    expect(end.feet).toBeCloseTo(y1, 6);
    expect(end.vy).toBeGreaterThan(0);
    // it stays put once it has landed (the loop may overshoot T by a frame)
    expect(arcAt(arc, arc.T + 3, unit)).toEqual(end);
  });

  it('agrees with the textbook ballistic formula', () => {
    const arc = planArc(f, 300, 1100, 1300, 700, false, middle);
    // feet(t) = y0 + vy0 t + g t²/2, with the gravity of a hop, reaches y1 at T (written out here, not via arcAt)
    expect(arc.y0 + arc.vy0 * arc.T + 0.5 * g * arc.T ** 2).toBeCloseTo(arc.y1, 6);
  });

  it('moves sideways at a steady speed', () => {
    const arc = planArc(f, 300, 1100, 1300, 700, false, middle);
    const xs = [0, 0.25, 0.5, 0.75, 1].map((k) => arcAt(arc, arc.T * k, f.unit).x);
    const steps = xs.slice(1).map((v, i) => v - xs[i]);
    for (const s of steps) expect(s).toBeCloseTo(steps[0], 6);
  });
});

describe('planArc: the apex is above both ends', () => {
  const f = frame();

  it.each([
    ['down', 300, 1100, 700, 1300],
    ['up', 700, 1500, 400, 1250],
    ['level', 200, 1300, 900, 1300],
    ['up a lot', 600, 1650, 600, 950],
  ])('%s', (_, x, feet, x1, y1) => {
    const arc = planArc(f, x, feet, y1, x1, false, middle);
    const g = leapGravity(f.unit);
    // sample the flight: the highest point is the arc's `top`, and it is above the higher of the two ends
    const heights = Array.from({ length: 401 }, (_, i) => arcAt(arc, (arc.T * i) / 400, f.unit).feet);
    const highest = Math.min(...heights);
    expect(highest).toBeCloseTo(arc.top, 0);
    expect(highest).toBeLessThan(Math.min(arc.y0, arc.y1));
    // by at least LEAP_RISE art pixels
    expect(Math.min(arc.y0, arc.y1) - arc.top).toBeGreaterThanOrEqual(LEAP_RISE * f.unit - 1e-9);
    // and it is reached part-way through, not at either end
    const tApex = -arc.vy0 / g;
    expect(tApex).toBeGreaterThan(0);
    expect(tApex).toBeLessThan(arc.T);
  });

  it('clears the higher end by LEAP_RISE, plus 6% of the way across, up to LEAP_ARC art pixels', () => {
    const u = f.unit;
    const clearance = (dx: number) => {
      const arc: Arc = planArc(f, 300, 1300, 1300, 300 + dx, false, middle);
      return Math.min(arc.y0, arc.y1) - arc.top;
    };
    expect(clearance(0)).toBeCloseTo(LEAP_RISE * u, 6);
    expect(clearance(50)).toBeCloseTo(LEAP_RISE * u + 0.06 * 50, 6);
    expect(clearance(-50)).toBeCloseTo(LEAP_RISE * u + 0.06 * 50, 6);
    expect(clearance(100)).toBeCloseTo(LEAP_RISE * u + 0.06 * 100, 6);
    // a long way across: no higher than the cap
    expect(clearance(2000)).toBeCloseTo((LEAP_RISE + LEAP_ARC) * u, 6);
    expect(clearance(4000)).toBeCloseTo((LEAP_RISE + LEAP_ARC) * u, 6);
  });
});

describe('planArc: from outside the window', () => {
  const f = frame();
  const top = winTop(f);
  const bottom = top + f.height;
  const u = f.unit;
  const half = (W * u) / 2;

  it('starts from where it stands when that is in or near the window, and asks for no random number', () => {
    let calls = 0;
    const arc = planArc(f, 321, top + 200, top + 500, 640, false, (a, b) => (calls++, middle(a, b)));
    expect([arc.x0, arc.y0]).toEqual([321, top + 200]);
    expect(calls).toBe(0);
  });

  it('starts just above the window when it is far above it (a fast scroll), at a random x near the target', () => {
    const arc = planArc(f, 321, top - 2000, top + 500, 640, false, (a) => a); // lowest random x: 70 left of the target
    expect(arc.y0).toBe(top - H * u - 24);
    expect(arc.x0).toBe(640 - 70);
    const right = planArc(f, 321, top - 2000, top + 500, 640, false, (_, b) => b);
    expect(right.x0).toBe(640 + 70);
  });

  it('is forced to come from above when told it is `outside` (it is away: nowhere to stand)', () => {
    const arc = planArc(f, 321, top + 200, top + 500, 640, true, middle);
    expect(arc.y0).toBe(top - H * u - 24);
    expect(arc.x0).toBe(640);
  });

  it('keeps the point it comes in from on the screen', () => {
    const left = planArc(f, 0, top - 2000, top + 500, 5, true, (a) => a);
    expect(left.x0).toBe(half + 2);
    const right = planArc(f, 0, top - 2000, top + 500, f.width - 5, true, (_, b) => b);
    expect(right.x0).toBe(f.width - half - 2);
  });

  it('starts just below the window, where it stands, when it is far below it (scrolled up in a hurry)', () => {
    const arc = planArc(f, 321, bottom + 2000, top + 500, 640, false, middle);
    expect(arc.y0).toBe(bottom + H * u + 24);
    expect(arc.x0).toBe(321);
  });

  it('only counts as "far" past 40px outside the dog\'s own height', () => {
    const edgeAbove = top - H * u - 40; // feet exactly here: still where it stands
    expect(planArc(f, 321, edgeAbove, top + 500, 640, false, middle).y0).toBe(edgeAbove);
    expect(planArc(f, 321, edgeAbove - 1, top + 500, 640, false, middle).y0).toBe(top - H * u - 24);
    const edgeBelow = bottom + H * u + 40;
    expect(planArc(f, 321, edgeBelow, top + 500, 640, false, middle).y0).toBe(edgeBelow);
    expect(planArc(f, 321, edgeBelow + 1, top + 500, 640, false, middle).y0).toBe(bottom + H * u + 24);
  });

  it('still lands on its target from out there', () => {
    for (const feet of [top - 3000, bottom + 3000]) {
      const arc = planArc(f, 321, feet, top + 500, 640, false, middle);
      const end = arcAt(arc, arc.T, u);
      expect(end.x).toBeCloseTo(640, 6);
      expect(end.feet).toBeCloseTo(top + 500, 6);
    }
  });
});

// ---- pickSpot -----------------------------------------------------------------------------------------

const U = 3; // px per art pixel
const WINDOW = 900; // window height
const LOW = BAR + H * U + 8; // the highest a platform can be in the window and still be comfortable (under the bar, all of the dog seen)...
const HIGH = WINDOW - 56; // ...and the lowest
const TARGET = WINDOW * 0.4; // where it would like to land: 40% of the way down (given a window this tall)

// A page with platforms at the given heights in the window (index 0 is the line, then the cards top to
// bottom); null is a platform it cannot stand on (a card that has been put away, a line that is too short).
function query(ys: (number | null)[], o: Partial<SpotQuery> & { T?: number; apex?: (i: number) => number } = {}): SpotQuery {
  const { T = 0.8, apex = (i) => (ys[i] ?? 0) - 80, ...rest } = o;
  return {
    count: ys.length - 1,
    perch: 0,
    unit: U,
    height: WINDOW,
    treeTop: 0,
    scrollY: 0,
    live: (i) => ys[i] !== null,
    windowY: (i) => ys[i] ?? 0,
    plan: (i) => ({ T, top: apex(i) }),
    speed: () => 0,
    ...rest,
  };
}

describe('pickSpot: which platform to hop to', () => {
  it('prefers the platform nearest 40% of the way down the window', () => {
    expect(pickSpot(query([null, 150, 340, 520, 700]), 1)).toBe(2);
    expect(pickSpot(query([null, 150, 400, 350, 700]), 1)).toBe(3);
    expect(pickSpot(query([null, 700, 600, 500]), 1)).toBe(3);
  });

  it('follows the window: 40% of a taller window is further down', () => {
    const ys = [null, 150, 340, 520, 700];
    expect(pickSpot(query(ys, { height: 900 }), 1)).toBe(2); // 360
    expect(pickSpot(query(ys, { height: 1300 }), 1)).toBe(3); // 520
  });

  it('does not aim above BAR + dog + 60 in a short window, however little 40% of it is', () => {
    const short = 300; // 40% of it is 120: right up against the bar
    const aim = BAR + H * U + 60;
    expect(aim).toBeGreaterThan(short * 0.4);
    // 130 is nearer to 120 than 168 is, but 168 is nearer to the aim, which is what counts
    expect(pickSpot(query([null, 130, aim + 1], { height: short }), 1)).toBe(2);
  });

  it('looks only at the platforms after the one it stands on going down (dir 1), before it going up (dir -1)', () => {
    const q = query([TARGET, 200, TARGET - 10, 700, 500], { perch: 2 });
    expect(pickSpot(q, 1)).toBe(4); // 500 is nearer than 700
    expect(pickSpot(q, -1)).toBe(0); // the line is spot on; card 1 is not
    expect(pickSpot(q, 0)).toBe(0); // with dir 0 it looks at all of them
    expect(pickSpot(query([200, TARGET, 700, 500], { perch: 2 }), -1)).toBe(1);
  });

  it('never picks a platform it cannot stand on', () => {
    expect(pickSpot(query([null, null, 340, 520]), 1)).toBe(2);
    expect(pickSpot(query([null, null, null]), 1)).toBe(-1);
    expect(pickSpot(query([null, TARGET]), 0)).toBe(1); // a line too short, but a card
    expect(pickSpot(query([TARGET, null]), 0)).toBe(0);
  });

  it('never picks one too close to the bar or to the bottom of the window', () => {
    expect(pickSpot(query([null, LOW - 1, HIGH + 1, 600]), 1)).toBe(3);
    expect(pickSpot(query([null, LOW - 1, HIGH + 1]), 1)).toBe(-1);
    expect(pickSpot(query([null, LOW]), 1)).toBe(1);
    expect(pickSpot(query([null, HIGH]), 1)).toBe(1);
  });

  it('is -1 when there is nothing to hop to', () => {
    expect(pickSpot(query([TARGET]), 1)).toBe(-1); // there is only the line
    expect(pickSpot(query([TARGET, TARGET], { perch: 1 }), 1)).toBe(-1); // it is on the last card
    expect(pickSpot(query([TARGET, TARGET], { perch: 0 }), -1)).toBe(-1); // it is on the line: nothing above
  });
});

describe('pickSpot: the page keeps moving while it is in the air', () => {
  // The y a platform is at by the time it lands is where it is now less speed x T (the page scrolls down
  // under it, so the cards go up the window), and that is what has to be comfortable and nearest the target.
  const T = 0.8;

  it('skips a card that will have scrolled up under the bar by the time it lands', () => {
    const ys = [null, LOW + 20, 700, 800];
    expect(pickSpot(query(ys, { T, speed: () => 0 }), 1)).toBe(1); // at rest it is the nearest to the target
    expect(pickSpot(query(ys, { T, speed: () => 300 }), 1)).toBe(2); // 300 * 0.8 = 240 up: it is gone, 700 -> 460
  });

  it('skips a card that will have scrolled out of the bottom by the time it lands (scrolling up)', () => {
    const ys = [null, LOW + 20, TARGET + 40];
    expect(pickSpot(query(ys, { T, speed: () => 0 }), 1)).toBe(2);
    // 600 * 0.8 = 480 down: 400 -> 880, past the bottom; 135 -> 615
    expect(pickSpot(query(ys, { T, speed: () => -600 }), 1)).toBe(1);
  });

  it('counts the whole flight: a longer hop is carried further', () => {
    const ys = [null, 400];
    expect(pickSpot(query(ys, { T: 0.5, speed: () => 600 }), 1)).toBe(-1); // 400 - 300 = 100: under the bar
    expect(pickSpot(query(ys, { T: 0.3, speed: () => 600 }), 1)).toBe(1); // 400 - 180 = 220
  });
});

describe('pickSpot: hopping up', () => {
  const barLine = BAR - 16; // the top of the arc has to be at least this far down the window

  it('skips a card whose hop would arc up under the bar', () => {
    const ys = [null, TARGET - 10, TARGET + 50, null]; // card 1 is the better one; it is on card 3
    const apex = (clear: number) => (i: number) => (i === 1 ? clear : 200);
    expect(pickSpot(query(ys, { perch: 3, apex: apex(barLine - 1) }), -1)).toBe(2);
    expect(pickSpot(query(ys, { perch: 3, apex: apex(barLine) }), -1)).toBe(1);
  });

  it('does not ask that of a hop down', () => {
    const ys = [null, TARGET - 10, TARGET + 50];
    expect(pickSpot(query(ys, { perch: 0, apex: () => -50 }), 1)).toBe(1);
    expect(pickSpot(query(ys, { perch: 3, apex: () => -50 }), -1)).toBe(-1);
  });

  it('measures the apex in the window, from the tree: the tree top and the scroll move it', () => {
    // window y of the apex = treeTop + top - scrollY
    const at = (scrollY: number) => query([null, TARGET, null, null], { perch: 3, apex: () => 700, treeTop: 200, scrollY });
    expect(pickSpot(at(900 - barLine), -1)).toBe(1); // 200 + 700 - (900 - 40) = 40: just clear of the bar
    expect(pickSpot(at(900 - barLine + 1), -1)).toBe(-1);
  });

  describe('with `any`, when its own card has been put away', () => {
    it('falls back on the nearest platform above that is there at all, however unsuitable', () => {
      const ys = [-300, -200, -100, null]; // none of them is in the window; it is on card 3
      expect(pickSpot(query(ys, { perch: 3 }), -1)).toBe(-1);
      expect(pickSpot(query(ys, { perch: 3 }), -1, true)).toBe(2);
      expect(pickSpot(query([-300, null, null, null], { perch: 3 }), -1, true)).toBe(0);
    });

    it('still prefers a comfortable one', () => {
      expect(pickSpot(query([-300, TARGET, -100, null], { perch: 3 }), -1, true)).toBe(1);
    });

    it('is only for going up', () => {
      const ys = [-300, -200, -100, null]; // as above: platforms above it, none of them in the window
      expect(pickSpot(query(ys, { perch: 3 }), 1, true)).toBe(-1);
      expect(pickSpot(query(ys, { perch: 3 }), 0, true)).toBe(-1);
    });
  });
});

describe('planArc and pickSpot together, on a page like the real one', () => {
  // cards 220px apart in the tree; the window is 900px tall and scrolled 450px down, so the dog, on card 1, is
  // near the top of it, and the cards below it are at window heights 370, 590, 810 and 1030
  const f = frame({ unit: U, height: WINDOW, scrollY: 450, treeTop: 0, width: 1200 });
  const floors = [200, 600, 820, 1040, 1260, 1480]; // [0] is the hero line
  const dog = { x: 500, feet: floors[1] };
  const windowY = (i: number) => f.treeTop + floors[i] - f.scrollY;
  const plan = (i: number, fr = f) => planArc(fr, dog.x, dog.feet, floors[i], 600, false, middle);
  const page = (speed: number): SpotQuery => ({
    count: 5, perch: 1, unit: f.unit, height: f.height, treeTop: f.treeTop, scrollY: f.scrollY,
    live: (i) => i > 0,
    windowY,
    plan: (i) => plan(i),
    speed: () => speed,
  });

  it('hops to the card that will be nearest the 40% line, and lands on it at T', () => {
    expect([2, 3, 4, 5].map(windowY)).toEqual([370, 590, 810, 1030]); // 370 is nearest 360; 1030 is off the bottom
    const j = pickSpot(page(0), 1);
    expect(j).toBe(2);
    const arc = plan(j);
    const end = arcAt(arc, arc.T, f.unit);
    expect(end.feet).toBeCloseTo(floors[j], 6);
    expect(end.x).toBeCloseTo(600, 6);
    // the page doesn't bend the arc: it is in tree coordinates
    expect(plan(j, { ...f, scrollY: f.scrollY + 40 })).toEqual(arc);
  });

  it('aims further down the page when it is being scrolled down: the cards will have moved up by then', () => {
    // at 400 px/s, by the time it lands card 2 is at about 130 and card 3 at about 280 (card 4 at about 450)
    expect(pickSpot(page(400), 1)).toBe(3);
  });
});
