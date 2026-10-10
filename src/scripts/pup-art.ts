// The dog's pixel art: a side-on body (for walking, falling, sitting, sleeping), a front-on face (for peeking
// out from behind a letter) and a paw print. Everything is composed from rectangles and then outlined
// automatically, which keeps each pose to a handful of lines.

export type Grid = string[][];

export const COLORS: Record<string, string> = {
  o: '#2a1a12', // outline
  b: '#f3ead8', // coat
  c: '#fffbf2', // chest, muzzle, paws
  d: '#c4864a', // tan: ears, patch, saddle, tail
  g: '#d6c9ae', // shade: the far legs
  t: '#ee6a80', // tongue
  w: '#ffffff',
};

export const W = 22; // body sprite size in art pixels
export const H = 17;
const OY = 2; // rows of empty space above the drawing, so the ear tips get an outline

const blank = (w: number, h: number): Grid => Array.from({ length: h }, () => Array<string>(w).fill('.'));

// every empty cell that touches a painted one becomes outline (cells outside the grid are skipped, so the
// row under the feet is left bare on purpose: the dog stands on the line rather than on a dark band)
function outline(g: Grid): Grid {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      if (g[y][x] !== '.') continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (g[y + dy]?.[x + dx] ?? '.') !== '.')) out[y][x] = 'o';
    }
  }
  return out;
}

// one <path> per colour, one run of pixels per row
export function paths(g: Grid, colors: Record<string, string> = COLORS): string {
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

// ---- body ---------------------------------------------------------------------------------------------

export interface Pose {
  dy?: number; // body drop
  legs?: number[]; // x of the near-back, far-back, near-front and far-front legs
  legY?: number;
  legH?: number;
  ears?: 'up' | 'high' | 'flat';
  tail?: 'up' | 'mid' | 'down' | 'wagA' | 'wagB';
  eye?: 'open' | 'shut' | 'wide';
  mouth?: boolean; // mouth open, tongue out
  sit?: boolean;
  lie?: boolean; // curled up asleep
  dive?: 1 | 2; // skydiving, flat out with the legs flung to the sides; the two frames flutter
  nose?: number; // rows the head hangs down (sniffing); negative lifts it
  fy?: number; // front legs' own top and length, if they differ from the back legs (reaching, paws in the air)
  fh?: number;
}

// The dog faces right; the sprite is mirrored in CSS to face left.
export function drawBody(p: Pose = {}): Grid {
  const { dy = 0, legs = [5, 8, 13, 11], legY = 12, legH = 3, ears = 'up', tail = 'up', eye = 'open', mouth = false, sit = false, lie = false, nose = 0 } = p;
  const { fy = legY, fh = legH } = p;
  const g = blank(W, H);
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = y + OY; j < y + OY + h; j++) for (let i = x; i < x + w; i++) if (g[j] && i >= 0 && i < W) g[j][i] = c;
  };
  const px = (x: number, y: number, c: string) => rect(x, y, 1, 1, c);

  if (lie) {
    // a loaf with its chin on its front paws
    rect(1, 12, 4, 3, 'd'); px(0, 13, 'd'); // tail curled round
    rect(3, 10, 14, 5, 'b');
    px(3, 10, '.'); px(16, 10, '.');
    rect(4, 10, 4, 2, 'd'); // saddle
    rect(6, 14, 8, 1, 'c'); // belly
    rect(13, 9, 8, 6, 'b'); // head
    px(13, 9, '.');
    rect(18, 12, 4, 3, 'b'); // snout
    rect(21, 12, 1, 1, 'o'); // nose
    rect(13, 9, 3, 4, 'd'); // ear lying back
    rect(17, 12, 2, 1, 'o'); // eye shut
    rect(16, 14, 6, 1, 'c'); // paws under the chin
    return outline(g);
  }

  if (p.dive) {
    // Skydiving: a level, slimmer body so there is room for ears blown straight up above the head and legs
    // flung out in a fan below it, all inside the outlined part of the sprite. The second frame has the ears
    // swap heights and the paws trail up a row.
    const f = p.dive === 2 ? 1 : 0;
    rect(0, 8 - f, 5, 2, 'g'); // far legs: straight back...
    rect(15, 10 - f, 4, 2, 'g'); // ...and straight forward
    [[3, 7], [2, 6], [2, 5], [1, 4], [2, 3]].forEach(([x, y]) => px(x, y, 'd')); // tail, up in the wind
    rect(4, 6, 11, 5, 'b');
    px(4, 6, '.'); px(4, 10, '.'); px(14, 10, '.');
    rect(6, 10, 5, 1, 'c'); // belly
    rect(12, 8, 3, 3, 'c'); // chest
    rect(4, 6, 3, 2, 'd'); // saddle
    rect(12, 3, 7, 6, 'b'); // head
    px(12, 3, '.'); px(18, 3, '.');
    rect(18, 5, 4, 3, 'b'); rect(18, 7, 4, 1, 'c'); rect(20, 5, 2, 1, 'o'); // snout, muzzle, nose
    rect(19, 8, 2, 1, 'o'); rect(19, 9, 2, 1, 't'); // mouth open, tongue out
    rect(16, 4, 2, 2, 'o'); // eye, wide
    rect(13, -1 + f, 2, 4 - f, 'd'); rect(16, f ? -1 : 0, 2, f ? 4 : 3, 'd'); // ears
    // near legs: a thigh and then a paw a step lower and further out
    rect(3, 11, 4, 2, 'b'); rect(0, 12 - f, 4, 2, 'b'); rect(0, 12 - f, 2, 2, 'c');
    rect(13, 11, 4, 2, 'b'); rect(16, 12 - f, 4, 2, 'b'); rect(18, 12 - f, 2, 2, 'c');
    return outline(g);
  }

  if (!sit) {
    rect(legs[1], legY, 2, legH, 'g');
    rect(legs[3], fy, 2, fh, 'g');
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
    if (tail === 'wagA') { rect(1, 13, 2, 2, 'd'); px(0, 12, 'd'); px(0, 11, 'd'); }
    else if (tail === 'wagB') { rect(0, 13, 3, 2, 'd'); px(1, 12, 'd'); }
    else rect(0, 13, 3, 2, 'd'); // lying on the ground
  } else {
    rect(4, 6 + dy, 11, 6, 'b');
    px(4, 6 + dy, '.'); px(4, 11 + dy, '.'); px(14, 11 + dy, '.');
    rect(6, 11 + dy, 5, 1, 'c'); // belly
    rect(12, 9 + dy, 3, 3, 'c'); // chest
    rect(4, 6 + dy, 3, 2, 'd'); // saddle
  }

  const hy = (sit ? 1 : 2) + dy + nose;
  if (nose > 0) rect(12, 6 + dy, 5, nose + 3, 'b'); // neck
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
    rect(legs[2], fy, 2, fh, 'b');
  }
  return outline(g);
}

export const POSES: Record<string, Pose> = {
  stand: {},
  blink: { eye: 'shut' },
  walk0: { legs: [4, 9, 14, 11] },
  walk1: { legs: [6, 7, 12, 13], legY: 11, legH: 4, dy: -1 },
  walk2: { legs: [8, 4, 11, 14] },
  walk3: { legs: [6, 7, 12, 13], legY: 11, legH: 4, dy: -1 },
  // a gallop: stretched out in the air, front paws down, bunched up, back paws push off
  run0: { dy: -1, legs: [1, 3, 17, 15], legY: 11, legH: 3, fy: 9, fh: 3, ears: 'flat', mouth: true, tail: 'mid' },
  run1: { dy: 0, legs: [3, 5, 16, 14], legY: 10, legH: 3, fy: 12, fh: 3, ears: 'flat', mouth: true, tail: 'mid' },
  run2: { dy: -1, legs: [8, 10, 10, 12], legY: 11, legH: 2, fy: 11, fh: 2, ears: 'flat', mouth: true, tail: 'mid' },
  run3: { dy: 0, legs: [2, 4, 17, 15], legY: 12, legH: 3, fy: 9, fh: 3, ears: 'flat', mouth: true, tail: 'mid' },
  sniff0: { nose: 4, legs: [4, 9, 14, 11], tail: 'mid' },
  sniff1: { nose: 4, legs: [5, 8, 13, 11], tail: 'up', dy: 0 },
  // on the edge: leaning out with the front paws scrabbling at nothing, then rocking back with them in the air
  teeterA: { nose: 2, dy: 1, legs: [3, 8, 16, 13], legY: 13, legH: 2, fy: 12, fh: 3, ears: 'flat', eye: 'wide', mouth: true },
  teeterB: { nose: -1, dy: -1, legs: [4, 7, 15, 17], legY: 11, legH: 4, fy: 7, fh: 3, ears: 'high', eye: 'wide', mouth: true, tail: 'mid' },
  fall: { legs: [2, 4, 14, 12], legY: 10, legH: 3, ears: 'high', mouth: true, eye: 'wide', dy: -2 },
  // skydiving down onto a card: legs out to the sides, ears blown up, fluttering between two frames
  diveA: { dive: 1 },
  diveB: { dive: 2 },
  land: { dy: 2, legY: 14, legH: 1, ears: 'flat', eye: 'shut', legs: [2, 7, 15, 12] },
  sit: { sit: true, tail: 'down' },
  sitBlink: { sit: true, tail: 'down', eye: 'shut' },
  wagA: { sit: true, tail: 'wagA' },
  wagB: { sit: true, tail: 'wagB' },
  happyA: { sit: true, tail: 'wagA', mouth: true },
  happyB: { sit: true, tail: 'wagB', mouth: true },
  lie: { lie: true },
};
export const WALK = ['walk0', 'walk1', 'walk2', 'walk3'];
export const RUN = ['run0', 'run1', 'run2', 'run3'];

// ---- face ---------------------------------------------------------------------------------------------

export const FW = 14; // face sprite size in art pixels
export const FH = 13;
const FOY = 1;

export interface FaceOpts {
  ex?: -1 | 0 | 1; // which way the eyes look
  ey?: -1 | 0 | 1;
  blink?: boolean;
  tongue?: boolean;
  ear?: boolean; // one ear lifted
}

// A pup's face, front on: floppy tan ears, a patch over one eye, a cream muzzle.
export function drawFace(o: FaceOpts = {}): Grid {
  const { ex = 0, ey = 0, blink = false, tongue = false, ear = false } = o;
  const g = blank(FW, FH);
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = y + FOY; j < y + FOY + h; j++) for (let i = x; i < x + w; i++) if (g[j] && i >= 0 && i < FW) g[j][i] = c;
  };
  const px = (x: number, y: number, c: string) => rect(x, y, 1, 1, c);

  // ears first, so the head overlaps their inner edge
  rect(0, 2, 3, 6, 'd');
  px(0, 2, '.');
  rect(11, 2, 3, 6, 'd');
  px(13, 2, '.');
  if (ear) { rect(11, 0, 3, 3, 'd'); px(13, 0, '.'); rect(12, 3, 2, 4, 'd'); }

  rect(2, 2, 10, 9, 'b');
  px(2, 2, '.'); px(11, 2, '.'); px(2, 10, '.'); px(11, 10, '.');
  rect(3, 3, 4, 4, 'd'); // patch over the left eye
  px(3, 3, '.');
  rect(4, 8, 6, 3, 'c'); // muzzle
  rect(6, 8, 2, 1, 'o'); // nose
  if (tongue) { rect(6, 9, 2, 1, 'o'); rect(6, 10, 2, 2, 't'); }

  // eyes: a 2×2 dark block each with a highlight, shifted a pixel to look about
  const eyes = [[4, 4], [8, 4]];
  for (const [x, y] of eyes) {
    const x2 = x + ex;
    const y2 = y + ey;
    if (blink) rect(x2, y2 + 1, 2, 1, 'o');
    else { rect(x2, y2, 2, 2, 'o'); px(x2, y2, 'w'); }
  }
  return outline(g);
}

// ---- paw print ----------------------------------------------------------------------------------------

const PAW = [
  '..##.##..',
  '..##.##..',
  '##.....##',
  '##.###.##',
  '..#####..',
  '.#######.',
  '.#######.',
  '..#####..',
];
const pawGrid = (): Grid => {
  // paint it in tan and outline it like the dog, so it reads on both the dark and the light page
  const g = blank(PAW[0].length + 2, PAW.length + 2);
  PAW.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') g[y + 1][x + 1] = 'd'; }));
  return outline(g);
};
export const PAW_GRID: Grid = pawGrid();
export const PAW_W = PAW_GRID[0].length;
export const PAW_H = PAW_GRID.length;
