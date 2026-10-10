import { describe, expect, it } from 'vitest';
import { COLORS, FH, FW, H, PAW_GRID, PAW_H, PAW_W, POSES, RUN, W, WALK, drawBody, drawFace, paths, type FaceOpts, type Grid } from './pup-art';

// What these protect: the dog is drawn from rectangles that are clipped to the sprite without a word, so a
// pose edited to reach past an edge simply loses those pixels. These tests say what every pose must keep true.

const poseNames = Object.keys(POSES);
const solid = (c: string) => c !== '.' && c !== 'o'; // a colour, not empty and not outline (eyes and noses are 'o' too, but never the extremes)
const cells = (g: Grid) => g.flatMap((row, y) => row.map((c, x) => ({ c, x, y })));
const lowestSolid = (g: Grid) => Math.max(...cells(g).filter((p) => solid(p.c)).map((p) => p.y));
const highestSolid = (g: Grid) => Math.min(...cells(g).filter((p) => solid(p.c)).map((p) => p.y));

// the SVG paths() writes, read back into a grid (and checked on the way: inside the viewBox, no cell twice)
function fromPaths(svg: string, w: number, h: number): Grid {
  const byFill = new Map(Object.entries(COLORS).map(([k, v]) => [v, k]));
  const g: Grid = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  const tags = [...svg.matchAll(/<path fill="([^"]+)" d="([^"]*)"\/>/g)];
  expect(tags.map((m) => m[0]).join('')).toBe(svg); // nothing but <path> elements
  for (const [, fill, d] of tags) {
    const key = byFill.get(fill);
    expect(key, `fill ${fill} is one of the palette's colours`).toBeDefined();
    const runs = [...d.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)];
    expect(runs.map((m) => m[0]).join('')).toBe(d); // nothing but pixel runs
    for (const [, sx, sy, sw] of runs) {
      const x = +sx, y = +sy, n = +sw;
      expect(y, 'run is inside the viewBox (row)').toBeLessThan(h);
      expect(x + n, 'run is inside the viewBox (column)').toBeLessThanOrEqual(w);
      for (let i = x; i < x + n; i++) {
        expect(g[y][i], `cell ${i},${y} is painted once`).toBe('.');
        g[y][i] = key!;
      }
    }
  }
  return g;
}

// the checks that hold for any sprite this module draws
function expectWellFormed(g: Grid, w: number, h: number) {
  expect(g).toHaveLength(h);
  for (const row of g) expect(row).toHaveLength(w);
  const palette = new Set(['.', ...Object.keys(COLORS)]);
  for (const { c, x, y } of cells(g)) expect(palette.has(c), `cell ${x},${y} is "${c}"`).toBe(true);
  expect(cells(g).some((p) => solid(p.c)), 'something is drawn').toBe(true);
  // outline() leaves no empty cell next to a coloured one (the ones past the edge can't be drawn, by design)
  for (const { c, x, y } of cells(g)) {
    if (c !== '.') continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = g[y + dy]?.[x + dx];
      expect(n === undefined || !solid(n), `empty cell ${x},${y} touches a coloured one`).toBe(true);
    }
  }
  // the SVG the page gets is the grid, every painted cell once, nothing outside
  expect(fromPaths(paths(g), w, h)).toEqual(g);
}

describe('body sprite', () => {
  it('is 22 x 17 art pixels (graph.ts and the CSS size it from W and H)', () => {
    expect([W, H]).toEqual([22, 17]);
  });

  it.each(poseNames)('%s is a well-formed 22 x 17 grid', (name) => {
    expectWellFormed(drawBody(POSES[name]), W, H);
  });

  it('draws the default pose when given nothing', () => {
    expect(drawBody()).toEqual(drawBody(POSES.stand));
  });

  it('has every pose the walk and run cycles ask for', () => {
    for (const n of [...WALK, ...RUN]) expect(poseNames, n).toContain(n);
  });
});

// ---- feet and the line --------------------------------------------------------------------------------
// outline() skips cells outside the grid, so a dog whose feet reach the last row has no outline row under
// them: it stands on the line instead of on a dark band. A dog in the air is the opposite: it is drawn a row
// or two up, so its outline (under the paws, under the legs flung out) is inside the sprite.
//
// Every pose is listed in exactly one of these, so a new pose has to say which it is.
const STANDING = [
  'stand', 'blink', 'walk0', 'walk1', 'walk2', 'walk3', 'sniff0', 'sniff1', 'teeterA', 'land',
  'plopA', 'plopB', 'sit', 'sitBlink', 'wagA', 'wagB', 'happyA', 'happyB', 'lie',
  // The gallop's frames that touch down. teeterB is here too: on the brink, rocked back, and also the start
  // of the frightened jump; either way its paws are on the bottom row.
  'run1', 'run3', 'teeterB',
];
const AIRBORNE = [
  'fall', // popped out from behind the name, or hopping on the spot when it is barked at
  'diveA', 'diveB', // skydiving onto a card
  'run0', 'run2', // the gallop's frames with all four paws off the ground (run0 is also the take-off of a hop)
];

describe('feet', () => {
  it('every pose is either standing or airborne, and not both', () => {
    expect([...STANDING, ...AIRBORNE].sort()).toEqual([...poseNames].sort());
  });

  it.each(STANDING)('%s stands on the last row, with no outline row under the feet', (name) => {
    expect(lowestSolid(drawBody(POSES[name]))).toBe(H - 1);
  });

  it.each(AIRBORNE)('%s is in the air: its outline row under the feet is inside the sprite', (name) => {
    const g = drawBody(POSES[name]);
    const feet = lowestSolid(g);
    expect(feet).toBeLessThan(H - 1);
    for (const { c, x, y } of cells(g)) if (y === feet && solid(c)) expect(g[feet + 1][x], `under ${x},${y}`).toBe('o');
  });
});

// ---- ears ---------------------------------------------------------------------------------------------
// Tall ears have to read as up. They are drawn above the head, which is near the top of the sprite, so a
// pose that lifts the head (dy, a negative nose) can push their tips past the top edge, where they are cut
// off without a word: the old fall pose's ears ended up two pixels stubs and never looked "up".
//
// The check does not hard-code how tall an ear is: it draws the same pose 4 rows lower, where nothing can
// reach the edge, and wants the ears to be as tall as they are there. (Columns 14 and 17 are the left and
// right ear, wherever the head is.)
const EAR_COLUMNS = [14, 17];
function earHeights(g: Grid) {
  return EAR_COLUMNS.map((x) => {
    const top = g.findIndex((row) => row[x] === 'd');
    let n = 0;
    while (top >= 0 && g[top + n]?.[x] === 'd') n++;
    return n;
  });
}
const usesTallEars = (name: string) => {
  const p = POSES[name];
  return !p.lie && !p.dive && (p.ears ?? 'up') !== 'flat';
};

// Poses whose ears ARE cut off at the moment (ears 'high' with the head at the very top of the sprite: two of
// the four rows of the near ear and one of the three of the far one go). Not fixed here, since fixing is a
// change to the art; they are expected to fail, so this list cannot go stale. When you redraw one, the test
// below tells you to take it off the list.
//   fall    still used: pup.ts sets it when the dog pops out from behind the name and when you click it
//   teeterB still used: the rocked-back frame of the teeter, and the frightened jump
const EARS_CUT_OFF = ['fall', 'teeterB'];

describe('ears', () => {
  const tall = poseNames.filter(usesTallEars);

  it('there are poses with tall ears to check', () => {
    expect(tall.length).toBeGreaterThan(10);
  });

  it.each(tall)('%s: ears are not cut off by the top of the sprite', (name) => {
    const pose = POSES[name];
    const wanted = earHeights(drawBody({ ...pose, dy: (pose.dy ?? 0) + 4 }));
    expect(wanted.every((n) => n >= 2), 'the reference render has ears').toBe(true);
    const got = earHeights(drawBody(pose));
    if (EARS_CUT_OFF.includes(name)) expect(got, `${name} is on EARS_CUT_OFF: if its ears are fixed, remove it from the list`).not.toEqual(wanted);
    else expect(got).toEqual(wanted);
  });

  it('every pose on the exemption list uses tall ears', () => {
    for (const n of EARS_CUT_OFF) expect(tall, n).toContain(n);
  });

  it.each(['diveA', 'diveB'])('%s: ears blown up are inside the sprite, with an outline row above them', (name) => {
    const g = drawBody(POSES[name]);
    const top = highestSolid(g);
    expect(top).toBeGreaterThanOrEqual(1);
    for (const { c, x, y } of cells(g)) if (y === top && solid(c)) expect(g[top - 1][x], `above ${x},${y}`).toBe('o');
  });
});

// ---- face and paw print -------------------------------------------------------------------------------
describe('face sprite', () => {
  const eyes = [-1, 0, 1] as const;
  const variants: FaceOpts[] = eyes.flatMap((ex) =>
    eyes.flatMap((ey) => [false, true].flatMap((blink) => [false, true].flatMap((tongue) => [false, true].map((ear) => ({ ex, ey, blink, tongue, ear }))))),
  );

  it('is 14 x 13 art pixels', () => {
    expect([FW, FH]).toEqual([14, 13]);
  });

  it('every variant is a well-formed 14 x 13 grid', () => {
    expect(variants).toHaveLength(72);
    for (const v of variants) expectWellFormed(drawFace(v), FW, FH);
  });

  it('the lifted ear keeps its outline row inside the sprite', () => {
    expect(highestSolid(drawFace({ ear: true }))).toBeGreaterThanOrEqual(1);
  });

  it.each<[string, FaceOpts]>([
    ['look right', { ex: 1 }],
    ['look left', { ex: -1 }],
    ['look down', { ey: 1 }],
    ['look up', { ey: -1 }],
    ['blink', { blink: true }],
    ['tongue', { tongue: true }],
    ['ear', { ear: true }],
  ])('%s changes the picture', (_, opts) => {
    expect(drawFace(opts)).not.toEqual(drawFace());
  });
});

describe('paw print', () => {
  it('is a well-formed grid of the size it says', () => {
    expect([PAW_W, PAW_H]).toEqual([PAW_GRID[0].length, PAW_GRID.length]);
    expectWellFormed(PAW_GRID, PAW_W, PAW_H);
  });

  it('is a single colour with its outline (so it reads on the dark and the light page)', () => {
    const used = new Set(PAW_GRID.flat().filter((c) => c !== '.'));
    expect([...used].sort()).toEqual(['d', 'o']);
  });
});
