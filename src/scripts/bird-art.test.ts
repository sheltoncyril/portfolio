import { describe, expect, it } from 'vitest';
import { paths, H as DOG_H, W as DOG_W, POSES as DOG_POSES, WALK as DOG_WALK, RUN as DOG_RUN, type Grid } from './pup-art';
import { COLORS, FH, FW, H, PAW_GRID, PAW_H, PAW_W, POSES, RUN, SNAKE_FRAMES, SNAKE_H, SNAKE_W, W, WALK, drawBody, drawFace, type FaceOpts } from './bird-art';

// The bird is a stand-in for the dog (?bird, see pup.ts): pup.ts runs it by pose name, so what matters is that
// it has every pose the dog has, drawn the way the layout expects (feet on the last row when it stands, and
// nothing cut off at the top).

const poseNames = Object.keys(POSES);
const solid = (c: string) => c !== '.' && c !== 'o';
const cells = (g: Grid) => g.flatMap((row, y) => row.map((c, x) => ({ c, x, y })));
const lowestSolid = (g: Grid) => Math.max(...cells(g).filter((p) => solid(p.c)).map((p) => p.y));

// the SVG paths() writes, read back into a grid (every painted cell once, nothing outside the viewBox)
function fromPaths(svg: string, w: number, h: number): Grid {
  const byFill = new Map(Object.entries(COLORS).map(([k, v]) => [v, k]));
  const g: Grid = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  const tags = [...svg.matchAll(/<path fill="([^"]+)" d="([^"]*)"\/>/g)];
  expect(tags.map((m) => m[0]).join('')).toBe(svg);
  for (const [, fill, d] of tags) {
    const key = byFill.get(fill);
    expect(key, `fill ${fill} is one of the palette's colours`).toBeDefined();
    const runs = [...d.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)];
    expect(runs.map((m) => m[0]).join('')).toBe(d);
    for (const [, sx, sy, sw] of runs) {
      const x = +sx, y = +sy, n = +sw;
      expect(y).toBeLessThan(h);
      expect(x + n).toBeLessThanOrEqual(w);
      for (let i = x; i < x + n; i++) {
        expect(g[y][i], `cell ${i},${y} is painted once`).toBe('.');
        g[y][i] = key!;
      }
    }
  }
  return g;
}

function expectWellFormed(g: Grid, w: number, h: number) {
  expect(g).toHaveLength(h);
  for (const row of g) expect(row).toHaveLength(w);
  const palette = new Set(['.', ...Object.keys(COLORS)]);
  for (const { c, x, y } of cells(g)) expect(palette.has(c), `cell ${x},${y} is "${c}"`).toBe(true);
  expect(cells(g).some((p) => solid(p.c)), 'something is drawn').toBe(true);
  for (const { c, x, y } of cells(g)) {
    if (c !== '.') continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = g[y + dy]?.[x + dx];
      expect(n === undefined || !solid(n), `empty cell ${x},${y} touches a coloured one`).toBe(true);
    }
  }
  expect(fromPaths(paths(g, COLORS), w, h)).toEqual(g);
}

describe('bird body sprite', () => {
  it('is as wide as the dog and taller (pup.ts and pup-math.ts size everything from W and H)', () => {
    expect(W).toBe(DOG_W);
    expect(H).toBeGreaterThan(DOG_H);
  });

  it('has every pose the dog has (pup.ts runs either by name), and the same walk and run cycles', () => {
    for (const n of Object.keys(DOG_POSES)) expect(poseNames, n).toContain(n);
    expect(WALK).toEqual(DOG_WALK);
    expect(RUN).toEqual(DOG_RUN);
  });

  it.each(poseNames)('%s is a well-formed W x H grid', (name) => {
    expectWellFormed(drawBody(POSES[name]), W, H);
  });

  it.each(poseNames)('%s has nothing cut off by the top of the sprite', (name) => {
    // row 0 is the room for the outline of whatever is highest: a coloured cell there has lost its outline
    expect(drawBody(POSES[name])[0].some(solid)).toBe(false);
  });
});

// Every pose is listed in exactly one of these, so a new pose has to say which it is. Standing: a foot on the
// last row, so it stands on the line instead of on a dark band. In the air: drawn a row up, outline under it.
const STANDING = [
  'stand', 'blink', 'walk0', 'walk1', 'walk2', 'walk3', 'sniff0', 'sniff1', 'teeterA', 'teeterB', 'land',
  'plopA', 'plopB', 'sit', 'sitBlink', 'wagA', 'wagB', 'happyA', 'happyB', 'lie', 'run0', 'run2',
  'peckA', 'peckB', // (the bird's own: pecking at the ground)
];
const AIRBORNE = ['fall', 'diveA', 'diveB', 'run1', 'run3']; // (the run's flight frames are the odd ones)

describe('bird feet', () => {
  it('every pose is either standing or airborne, and not both', () => {
    expect([...STANDING, ...AIRBORNE].sort()).toEqual([...poseNames].sort());
  });

  it.each(STANDING)('%s stands on the last row', (name) => {
    expect(lowestSolid(drawBody(POSES[name]))).toBe(H - 1);
  });

  it.each(AIRBORNE)('%s is in the air: its outline row under the feet is inside the sprite', (name) => {
    const g = drawBody(POSES[name]);
    const feet = lowestSolid(g);
    expect(feet).toBeLessThan(H - 1);
    for (const { c, x, y } of cells(g)) if (y === feet && solid(c)) expect(g[feet + 1][x], `under ${x},${y}`).toBe('o');
  });
});

describe('bird face sprite', () => {
  const eyes = [-1, 0, 1] as const;
  const variants: FaceOpts[] = eyes.flatMap((ex) =>
    eyes.flatMap((ey) => [false, true].flatMap((blink) => [false, true].flatMap((tongue) => [false, true].map((ear) => ({ ex, ey, blink, tongue, ear }))))),
  );

  it('is the dog face\'s size, 14 x 13', () => {
    expect([FW, FH]).toEqual([14, 13]);
  });

  it('every variant is a well-formed grid', () => {
    for (const v of variants) expectWellFormed(drawFace(v), FW, FH);
  });

  it.each<[string, FaceOpts]>([
    ['look right', { ex: 1 }],
    ['look left', { ex: -1 }],
    ['look down', { ey: 1 }],
    ['blink', { blink: true }],
    ['beak open', { tongue: true }],
    ['crest up', { ear: true }],
  ])('%s changes the picture', (_, opts) => {
    expect(drawFace(opts)).not.toEqual(drawFace());
  });
});

describe('footprint and snake', () => {
  it('the footprint is a well-formed grid of the size it says, in one colour and its outline', () => {
    expect([PAW_W, PAW_H]).toEqual([PAW_GRID[0].length, PAW_GRID.length]);
    expectWellFormed(PAW_GRID, PAW_W, PAW_H);
    expect([...new Set(PAW_GRID.flat().filter((c) => c !== '.'))].sort()).toEqual(['l', 'o']);
  });

  it('the snake has two wriggles and a squashed frame, all well-formed', () => {
    expect(Object.keys(SNAKE_FRAMES).sort()).toEqual(['a', 'b', 'flat']);
    for (const g of Object.values(SNAKE_FRAMES)) expectWellFormed(g, SNAKE_W, SNAKE_H);
    expect(SNAKE_FRAMES.a).not.toEqual(SNAKE_FRAMES.b);
  });
});
