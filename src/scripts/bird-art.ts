// A secretary bird to stand in for the dog (add ?bird to the URL; see pup.ts). It has the same pose names as
// pup-art.ts (and is as wide, though much taller: it is mostly legs), so the behaviour in pup.ts runs it as it
// is: only the art, a couple of words ("squawk!") and one extra bit of business differ. The bird has no use for
// sniffing, so where the dog would put its nose to the ground, the bird stamps on a snake.
//
// Everything is composed from rectangles and little ASCII stamps and then outlined by pup-art's outline().

import { blank, outline, type Grid } from './pup-art';

export const COLORS: Record<string, string> = {
  o: '#2a1a12', // outline
  b: '#c3ccd6', // plumage, blue-grey
  c: '#eef1f5', // pale: chest, the bases of the crest
  d: '#383e4b', // black: trousers, flight feathers, tail and crest tips
  g: '#d58f78', // the far leg, in shade
  l: '#f2b79c', // legs
  r: '#ee6a2e', // bare skin round the eye
  y: '#f0c240', // beak
  t: '#ee6a80', // tongue
  w: '#ffffff',
  n: '#6cbb5a', // snake
  m: '#3e8a3a', // snake, the darker markings
  x: '#e0475b', // snake's tongue
};

// Body sprite size in art pixels: as wide as the dog and a good deal taller, all of it legs. pup.ts and
// pup-math.ts take the size from here, so nothing else needs to know.
export const W = 22;
export const H = 24;
const OY = 2; // rows of empty space above the drawing, so the crest tips get an outline
const FOOT = H - 1 - OY; // the row the toes are on when it stands
// The poses that are not on their legs (asleep, sat down, gliding) are drawn as they were for a 17-row sprite,
// with the ground at row 14, and moved down by this much.
const DROP = FOOT - 14;

/** Where its head is, in art pixels from the centre / the top of the body sprite (pup.ts pops it out from behind the name there). */
export const HEAD = { dx: 6, dy: 3.5 };

// ---- body ---------------------------------------------------------------------------------------------

interface Leg {
  x?: number; // where the toes are, relative to the hip
  lift?: number; // rows the foot is lifted off the ground
}

export interface Pose {
  dy?: number; // body drop (negative: up)
  near?: Leg;
  far?: Leg;
  head?: number; // rows the head is lowered (stamping on a snake)
  eye?: 'open' | 'shut' | 'wide';
  beak?: boolean; // open
  crest?: 'down' | 'up' | 'back';
  wings?: 'folded' | 'half' | 'out' | 'up';
  plop?: boolean; // sat down hard, legs in the air
  lie?: boolean; // resting on its legs, asleep
  glide?: 1 | 2; // flying; the two frames are the two ends of a wing beat
}

const CREST: Record<NonNullable<Pose['crest']>, string[]> = {
  down: ['....cc', '..ddcc', '.dd.c.', '.d....'], // hanging down behind the head
  up: ['..d.d.', '..dcd.', '..dcc.', '...cc.'], // raised, as it is when it is pleased
  back: ['...ddd', '.ddccc', 'dd.cc.', '......'], // streaming behind it, running
};

const WINGS: Record<'half' | 'out' | 'up', { x: number; y: number; rows: string[] }> = {
  half: { x: 4, y: 3, rows: ['..dd..', 'dddbbb'] },
  out: { x: 1, y: 0, rows: ['.dd.......', '.dddd.....', '..ddddbb..', '...dddbbbb', '....ddbbbb'] },
  up: { x: 5, y: -1, rows: ['..dd...', '.dddd..', '.dbbbd.', 'dbbbbb.', 'bbbbb..'] },
};

// the wing in flight, seen from the side, at the top and at the bottom of a beat (black feathers at the tip)
const FLAP = {
  up: ['...dd.....', '..dddd....', '.dddddd...', 'dddbbbbb..', 'ddbbbbbbb.', '.dbbbbbbbb', '..bbbbbbbb', '...bbbbbb.', '....bbbb..'],
  down: ['.bbbbbbb..', 'dbbbbbbbb.', 'ddbbbbbb..', 'dddbbbb...', '.ddddd....', '..dddd....'],
};

// The bird faces right; the sprite is mirrored in CSS to face left.
export function drawBody(p: Pose = {}): Grid {
  const { dy = 0, near = {}, far = {}, head = 0, eye = 'open', beak = false, crest = 'down', wings = 'folded' } = p;
  const g = blank(W, H);
  let ys = 0; // how far down everything is drawn (DROP, for the poses that are not standing)
  // '_' clears a cell (the way the dog does it with px(x, y, '.'), which here would read as "leave it")
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = y + ys + OY; j < y + ys + OY + h; j++) for (let i = x; i < x + w; i++) if (g[j] && i >= 0 && i < W) g[j][i] = c === '_' ? '.' : c;
  };
  const px = (x: number, y: number, c: string) => rect(x, y, 1, 1, c);
  // in a stamp '.' leaves what is there and '_' clears it
  const put = (x: number, y: number, rows: string[]) =>
    rows.forEach((row, j) =>
      [...row].forEach((c, i) => {
        if (c !== '.') px(x + i, y + j, c);
      }),
    );
  const line = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
  };
  // A leg is one pixel wide: from the hip down to the joint and on to the foot, the toes pointing the way it
  // faces. The joint is the ankle (the knee is up in the feathers), so it is a bird's backward "knee": it sits
  // behind the line from hip to foot, `bend` pixels, and so more the more the leg is folded.
  const leg = (hipX: number, hipY: number, footX: number, footY: number, c: string, bend = 2) => {
    const jx = Math.round(hipX + (footX - hipX) * 0.35) - bend;
    const jy = Math.round(hipY + (footY - hipY) * 0.35);
    line(hipX, hipY, jx, jy, c);
    line(jx, jy, footX, footY, c);
    rect(footX, footY, 3, 1, c);
  };
  // the head, with its beak, eye and the bare skin around it; its top-left corner is (hx, hy)
  const face = (hx: number, hy: number) => {
    put(hx, hy, ['.cbbb...', 'cbbbrryy', '.bbbryyy', '..bbbryd']);
    if (eye === 'shut') { px(hx + 2, hy + 1, 'o'); px(hx + 3, hy + 1, 'o'); }
    else { px(hx + 3, hy + 1, 'o'); if (eye === 'wide') { px(hx + 3, hy, 'w'); px(hx + 2, hy + 1, 'w'); } }
    // beak open: the lower half drops away
    if (beak) { put(hx + 5, hy + 3, ['.oo']); put(hx + 4, hy + 4, ['.yyt']); }
  };

  if (p.lie) {
    ys = DROP;
    // resting on its folded legs: a mound with the neck still up, eyes shut, the tail trailing behind
    rect(0, 12, 6, 1, 'd'); px(0, 12, 'c'); rect(1, 13, 5, 1, 'd');
    rect(4, 8, 11, 7, 'b');
    px(4, 8, '_'); px(14, 8, '_'); px(4, 14, '_');
    rect(5, 10, 7, 3, 'd'); px(5, 10, '_'); // wing folded over the back
    rect(12, 10, 3, 4, 'c'); // chest
    rect(12, 5, 3, 4, 'b'); // neck
    face(12, 2);
    put(6, 2, CREST.down);
    rect(12, 14, 8, 1, 'l'); // the long legs folded flat in front of it
    return outline(g);
  }

  if (p.glide) {
    // Flying: the neck stretched out in front, the legs trailing straight behind, the crest and tail blown
    // back, and the wings at the two ends of a beat (1: up, 2: swept down). Drawn low in the sprite, so that it
    // leaves the line and lands on the next one from where its feet were.
    const f = p.glide === 2;
    rect(0, 12, 6, 1, 'd'); px(0, 12, 'c'); rect(1, 13, 5, 1, 'd'); // tail
    leg(9, 15, 0, 16, 'g', 0); leg(10, 15, 2, 17, 'l', 0); // legs, trailing
    rect(6, 12, 10, 3, 'b');
    px(6, 12, '_'); px(15, 14, '_');
    rect(13, 12, 3, 3, 'c'); // chest
    rect(9, 14, 4, 2, 'd'); // trousers
    rect(13, 10, 3, 3, 'b'); // neck
    put(8, 8, CREST.back.slice(0, 3));
    face(14, 8);
    if (f) put(3, 13, FLAP.down);
    else put(3, 3, FLAP.up);
    return outline(g);
  }

  if (p.plop) {
    ys = DROP;
    // sat down hard on its tail, legs thrown up in front of it, wings flailing
    put(1, 3, WINGS.out.rows);
    rect(0, 12, 7, 1, 'd'); px(0, 12, 'c'); rect(1, 13, 6, 1, 'd');
    rect(4, 8, 9, 7, 'b');
    px(4, 8, '_'); px(4, 14, '_');
    rect(11, 10, 2, 4, 'c'); // chest
    rect(5, 11, 5, 4, 'd'); // trousers, folded up under it
    rect(10, 5, 3, 4, 'b'); // neck
    leg(11, 13, 18, 11, 'g'); leg(12, 12, 17, 8, 'l');
    face(10, 1);
    put(4, 1, CREST[crest]);
    return outline(g);
  }

  // standing: legs first, so the trousers and the body cover the tops of them
  const hipY = 7 + dy; // (up under the body and the trousers: the bare leg shows from where they end)
  const nearX = 12;
  const farX = 6;
  // (the poses say how far a foot goes and how high it lifts for a short-legged bird: these are longer)
  const reach = (l: Leg) => Math.round((l.x ?? 0) * 1.4);
  const raise = (l: Leg) => (l.lift ?? 0) * 2;
  const fold = (l: Leg) => 2 + Math.round(raise(l) / 2); // a foot that is lifted folds the ankle further back
  leg(farX, hipY, farX + reach(far), FOOT - raise(far), 'g', fold(far));
  leg(nearX, hipY, nearX + reach(near), FOOT - raise(near), 'l', fold(near));

  // tail: two long streamers
  put(0, 5 + dy, ['..dddd', '.ddddd', 'cddd..']);
  // a slim body, with the black flight feathers along the lower back and the black "trousers" on the thigh
  rect(5, 4 + dy, 11, 3, 'b');
  px(5, 4 + dy, '_'); px(5, 6 + dy, '_'); px(15, 6 + dy, '_');
  rect(14, 5 + dy, 2, 2, 'c'); // chest
  rect(4, 5 + dy, 5, 2, 'd'); // flight feathers
  rect(9, 6 + dy, 4, 3, 'd'); // trousers
  if (wings !== 'folded') {
    const w = WINGS[wings];
    put(w.x, Math.max(w.y + dy, -1), w.rows);
  }
  // neck and head (lowered, it reaches forward as well). The head stays inside the sprite when the body bounces
  // up: it is the neck that squashes.
  const lean = head > 1 ? 1 : 0;
  const hx = 14 + lean;
  const hy = Math.max(-1, -1 + dy + head);
  const neckTop = Math.max(2 + dy, hy + 2);
  rect(14 + lean, neckTop, 3, 4 + dy + head - neckTop + 1, 'b');
  face(hx, hy);
  put(hx - 6, hy, CREST[crest]);
  return outline(g);
}

const STAND: Pose = {};
export const POSES: Record<string, Pose> = {
  stand: STAND,
  blink: { eye: 'shut' },
  // A foot that is on the ground slides back under the body (front, middle, back); a foot that is off it
  // swings forward again (lifted, passing through). The two legs are half a cycle apart:
  //   near: front, middle, back, swinging      far: back, swinging, front, middle
  walk0: { near: { x: 2 }, far: { x: -2 } },
  walk1: { dy: -1, near: {}, far: { x: 1, lift: 3 } },
  walk2: { near: { x: -2 }, far: { x: 2 } },
  walk3: { dy: -1, near: { x: 1, lift: 3 }, far: {} },
  // a run: stretched out in the air, down on the toes, bunched up, push off
  // (the same rule: the near foot lands in front, pushes off behind and swings forward through the air, and the
  // far foot is half a cycle behind it: contact, flight, contact, flight)
  run0: { near: { x: 2 }, far: { x: -3, lift: 3 }, wings: 'half', crest: 'back', beak: true },
  run1: { dy: -2, near: { x: -3, lift: 3 }, far: { x: 1, lift: 3 }, wings: 'half', crest: 'back', beak: true }, // (not across the near leg)
  run2: { near: { x: -3, lift: 3 }, far: { x: 2 }, wings: 'half', crest: 'back', beak: true },
  run3: { dy: -2, near: { x: 2, lift: 3 }, far: { x: -2, lift: 3 }, wings: 'half', crest: 'back', beak: true },
  // the snake business: head down at it, one foot up, then stamped
  sniff0: { head: 3, near: { x: 4, lift: 4 }, far: {}, crest: 'down' },
  sniff1: { head: 3, near: { x: 5 }, far: {}, crest: 'up' },
  // pecking at the ground, when there is no snake and it is not hungry (it has no use for sniffing)
  peckA: { head: 3 },
  peckB: { head: 4 },
  // on the edge: leaning out, wings going round; then rocked back, wings up
  teeterA: { dy: 1, head: 1, near: { x: 1 }, far: { x: -1 }, wings: 'out', eye: 'wide', beak: true, crest: 'up' },
  teeterB: { dy: -1, near: { x: 2 }, far: { x: -2 }, wings: 'up', eye: 'wide', beak: true, crest: 'back' },
  fall: { dy: -2, near: { x: 0, lift: 2 }, far: { x: -1, lift: 1 }, wings: 'up', eye: 'wide', beak: true, crest: 'up' },
  diveA: { glide: 1, crest: 'back' },
  diveB: { glide: 2, crest: 'back' },
  land: { dy: 2, near: { x: 1 }, far: { x: -1 }, eye: 'shut', wings: 'half' },
  plopA: { plop: true, eye: 'wide', beak: true, crest: 'up' },
  plopB: { plop: true, eye: 'shut', beak: true, crest: 'down' },
  sit: STAND,
  sitBlink: { eye: 'shut' },
  wagA: { crest: 'up' },
  wagB: { crest: 'back' },
  happyA: { wings: 'half', beak: true, crest: 'up' },
  happyB: { wings: 'out', beak: true, crest: 'up' },
  lie: { lie: true, eye: 'shut' },
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
  tongue?: boolean; // beak open
  ear?: boolean; // crest raised
}

// Front on: a pale head with the crest sticking up behind it, bare orange skin round the eyes, a hooked beak.
export function drawFace(o: FaceOpts = {}): Grid {
  const { ex = 0, ey = 0, blink = false, tongue = false, ear = false } = o;
  const g = blank(FW, FH);
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = y + FOY; j < y + FOY + h; j++) for (let i = x; i < x + w; i++) if (g[j] && i >= 0 && i < FW) g[j][i] = c;
  };
  const px = (x: number, y: number, c: string) => rect(x, y, 1, 1, c);

  // the crest: quills with black tips, fanned out behind and above the head (a few shoot up when it is lifted)
  rect(1, 2, 12, 3, 'c');
  [1, 3, 5, 8, 10, 12].forEach((x, i) => { px(x, 1, 'd'); if (ear && i % 2 === 0) { px(x, 0, 'd'); px(x, 1, 'd'); } });
  [2, 4, 7, 9, 11].forEach((x) => px(x, 2, 'd'));
  px(1, 2, 'd'); px(12, 2, 'd');

  rect(2, 3, 10, 8, 'b'); // head
  px(2, 3, '.'); px(11, 3, '.'); px(2, 10, '.'); px(11, 10, '.');
  rect(3, 4, 3, 4, 'r'); rect(8, 4, 3, 4, 'r'); // bare skin round the eyes
  rect(5, 8, 4, 2, 'c'); // throat

  // beak: a narrow wedge, hooked at the tip
  rect(6, 5, 2, 3, 'y');
  rect(6, 8, 2, 1, 'd');
  if (tongue) { rect(6, 9, 2, 1, 'o'); rect(6, 10, 2, 1, 't'); }
  else px(7, 9, 'd');

  // eyes: a 2x2 dark block each with a highlight, shifted a pixel to look about; long lashes on top
  for (const [x, y] of [[3, 5], [9, 5]]) {
    const x2 = x + ex;
    const y2 = y + ey;
    if (blink) rect(x2, y2 + 1, 2, 1, 'o');
    else { rect(x2, y2, 2, 2, 'o'); px(x2, y2, 'w'); rect(x2, y2 - 1, 2, 1, 'd'); }
  }
  return outline(g);
}

// ---- footprint ----------------------------------------------------------------------------------------

// three toes forward and one back, like a trident
const PRINT = [
  '....#....',
  '#...#...#',
  '.#..#..#.',
  '..#.#.#..',
  '...###...',
  '....#....',
  '....#....',
  '....#....',
];
const printGrid = (): Grid => {
  const g = blank(PRINT[0].length + 2, PRINT.length + 2);
  PRINT.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') g[y + 1][x + 1] = 'l'; }));
  return outline(g);
};
export const PAW_GRID: Grid = printGrid();
export const PAW_W = PAW_GRID[0].length;
export const PAW_H = PAW_GRID.length;

// ---- the snake ----------------------------------------------------------------------------------------

export const SNAKE_W = 14;
export const SNAKE_H = 6;

// a wavy line of single pixels, head on the right with its tongue out; the two frames are half a wave apart
function snake(phase: number): Grid {
  const g = blank(SNAKE_W, SNAKE_H);
  let prev = -1;
  for (let x = 0; x < SNAKE_W - 2; x++) {
    const y = Math.round(2.5 + 1.5 * Math.sin((x * 2 * Math.PI) / 7 + phase));
    for (let yy = prev < 0 ? y : Math.min(prev, y); yy <= (prev < 0 ? y : Math.max(prev, y)); yy++) g[yy][x] = x % 3 === 1 ? 'm' : 'n';
    prev = y;
  }
  const hy = Math.min(4, Math.max(2, prev));
  g[hy][SNAKE_W - 2] = 'n'; g[hy][SNAKE_W - 3] = 'n';
  g[hy][SNAKE_W - 1] = 'x'; // tongue
  g[hy - 1][SNAKE_W - 3] = 'o'; // eye
  return outline(g);
}
// squashed: a flat strip, with its eyes squeezed shut
function flatSnake(): Grid {
  const g = blank(SNAKE_W, SNAKE_H);
  for (let x = 0; x < SNAKE_W - 1; x++) g[4][x] = x % 3 === 1 ? 'm' : 'n';
  g[3][SNAKE_W - 3] = 'o'; g[3][SNAKE_W - 5] = 'o';
  return outline(g);
}
export const SNAKE_FRAMES: Record<string, Grid> = { a: snake(0), b: snake(Math.PI), flat: flatSnake() };
