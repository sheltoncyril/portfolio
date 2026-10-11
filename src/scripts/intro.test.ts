// The intro's decision and timing are plain functions (see intro.ts); the DOM layer around them is covered by
// hand (README, "The intro"). These pin the numbers the CSS and the README rely on.
import { describe, expect, it } from 'vitest';
import { ENTER_DELAY, OUTPUT, OUTPUT_END, START_DELAY, introPlan, shouldRun, typingDelays, type IntroEnv } from './intro';

const base: IntroEnv = { reduced: false, forced: false, off: false, seen: false, restored: false, hash: '', scrollY: 0 };
const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const COMMAND = 'git log --graph';

describe('shouldRun', () => {
  it('plays on a fresh visit at the top of the page', () => {
    expect(shouldRun(base)).toBe(true);
  });

  it.each([
    ['reduced motion', { reduced: true }],
    ['?intro=0', { off: true }],
    ['already seen in this session', { seen: true }],
    ['a reload or back/forward navigation', { restored: true }],
    ['a deep link', { hash: '#contact' }],
    ['a restored scroll position', { scrollY: 900 }],
  ])('does not play for %s', (_why, patch) => {
    expect(shouldRun({ ...base, ...patch })).toBe(false);
  });

  it('allows a pixel or two of scroll, not a real scroll position', () => {
    expect(shouldRun({ ...base, scrollY: 4 })).toBe(true);
    expect(shouldRun({ ...base, scrollY: 5 })).toBe(false);
  });

  it('?intro=1 forces it past everything except reduced motion and ?intro=0', () => {
    const forced = { ...base, forced: true };
    expect(shouldRun({ ...forced, seen: true })).toBe(true);
    expect(shouldRun({ ...forced, restored: true })).toBe(true);
    expect(shouldRun({ ...forced, hash: '#log', scrollY: 800 })).toBe(true);
    expect(shouldRun({ ...forced, reduced: true })).toBe(false);
    expect(shouldRun({ ...forced, off: true })).toBe(false);
  });
});

describe('typingDelays', () => {
  it('has one delay per character, each a plausible keystroke', () => {
    const d = typingDelays(COMMAND, seeded(3));
    expect(d).toHaveLength(COMMAND.length);
    for (const ms of d) {
      expect(ms).toBeGreaterThanOrEqual(30);
      expect(ms).toBeLessThanOrEqual(30 + 30 + 40 + 25);
    }
  });

  it('pauses a little more at a space and before the next word', () => {
    const d = typingDelays('ab cd', () => 0); // no jitter: the base is 30 ms
    expect(d).toEqual([30, 30, 70, 55, 30]);
  });

  it('is uneven but reproducible for a given random source', () => {
    const a = typingDelays(COMMAND, seeded(11));
    const b = typingDelays(COMMAND, seeded(11));
    const c = typingDelays(COMMAND, seeded(12));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(new Set(a).size).toBeGreaterThan(5);
  });
});

describe('introPlan', () => {
  const plan = introPlan(COMMAND, seeded(5));

  it('types every character, in order, after the opening beat', () => {
    expect(plan.keys).toHaveLength(COMMAND.length);
    expect(plan.keys[0]).toBeGreaterThan(START_DELAY);
    for (let i = 1; i < plan.keys.length; i++) expect(plan.keys[i]).toBeGreaterThan(plan.keys[i - 1]);
  });

  it('presses Enter a beat after the last key, then prints the output in order', () => {
    expect(plan.enter).toBe(plan.keys[plan.keys.length - 1] + ENTER_DELAY);
    expect(plan.steps.map((s) => s.name)).toEqual(OUTPUT.map((s) => s.name));
    plan.steps.forEach((s, i) => expect(s.at).toBe(plan.enter + OUTPUT[i].at));
    for (let i = 1; i < plan.steps.length; i++) expect(plan.steps[i].at).toBeGreaterThanOrEqual(plan.steps[i - 1].at);
  });

  it('ends after the last part has had time to fade in (0.3 s in global.css)', () => {
    expect(plan.total).toBe(plan.enter + OUTPUT_END);
    expect(OUTPUT[OUTPUT.length - 1].at + 300).toBeLessThanOrEqual(OUTPUT_END);
  });

  it('keeps the whole thing to about 2.5 s whatever the random source', () => {
    const rand = seeded(99);
    for (let i = 0; i < 300; i++) {
      const t = introPlan(COMMAND, rand).total;
      expect(t).toBeGreaterThan(2200);
      expect(t).toBeLessThan(2800);
    }
  });
});
