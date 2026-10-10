// A shell-style start. On a first visit the page begins as just a prompt and a blinking cursor; the command
// `git log --graph` is typed, "Enter" is pressed and the page prints: the top bar, the name, the hero line
// drawing itself, then the role and the intro. Any key, tap or scroll jumps to the finished page.
//
// It is all progressive enhancement. Without JS, with reduced motion, on a deep link, or on a second visit
// in the same session the HTML simply is the finished page. The decision to run is made by the inline script
// in Base.astro, before first paint, which puts the class `sh` on <html>; global.css hides things only under
// that class. This module takes over from there and removes the class again at the end (or when skipped), so
// the final page is exactly the static one. If this script never arrives the inline script's watchdog removes
// the class after a few seconds.
//
// The timing and the decision are plain functions (`introPlan`, `shouldRun`) so they can be tested without a
// browser; `runIntro` is the thin DOM layer around them.

export const STORAGE_KEY = 'intro-seen';
export const START_DELAY = 600; // ms of prompt and blinking cursor before the first key (about one blink)
export const ENTER_DELAY = 150; // ms between the last key and Enter

/** The parts of the page that print after Enter, in ms after Enter. `done` ends the intro. */
export const OUTPUT = [
  { name: 'bar', at: 0 },
  { name: 'name', at: 80 },
  { name: 'line', at: 280 },
  { name: 'role', at: 560 },
  { name: 'intro', at: 660 },
] as const;
export const OUTPUT_END = 980;

export type Step = (typeof OUTPUT)[number]['name'];

export interface IntroEnv {
  reduced: boolean; // prefers-reduced-motion
  forced: boolean; // ?intro=1
  off: boolean; // ?intro=0
  seen: boolean; // it has already played in this tab's session
  restored: boolean; // a reload or back/forward navigation: the browser puts the scroll position back
  hash: string; // location.hash: a deep link goes straight to its section
  scrollY: number; // a restored scroll position means the reader is not at the start
}

/** Should the intro play? (The inline script in Base.astro makes the same decision before first paint.) */
export function shouldRun(e: IntroEnv): boolean {
  if (e.off || e.reduced) return false;
  if (e.forced) return true;
  return !e.seen && !e.restored && !e.hash && e.scrollY <= 4;
}

/** Milliseconds before each character is typed, after the one before it: a little uneven, like a person. */
export function typingDelays(text: string, rand: () => number = Math.random): number[] {
  return [...text].map((ch, i, all) => {
    let d = 30 + rand() * 30;
    if (ch === ' ') d += 40; // a beat at the space
    if (i > 0 && all[i - 1] === ' ') d += 25; // thinking about the next word
    return Math.round(d);
  });
}

export interface Plan {
  keys: number[]; // when each character appears, in ms from the start
  enter: number; // when Enter is pressed
  steps: { name: Step; at: number }[]; // when each part of the output prints
  total: number; // when the intro is over
}

export function introPlan(text: string, rand: () => number = Math.random): Plan {
  const keys: number[] = [];
  let t = START_DELAY;
  for (const d of typingDelays(text, rand)) {
    t += d;
    keys.push(t);
  }
  const enter = t + ENTER_DELAY;
  return { keys, enter, steps: OUTPUT.map((s) => ({ name: s.name, at: enter + s.at })), total: enter + OUTPUT_END };
}

// ---- the DOM layer -----------------------------------------------------------------------------------

const CLASSES = ['sh', 'sh-typing', 'sh-enter', ...OUTPUT.map((s) => `sh-${s.name}`)];
const clear = (html: HTMLElement) => html.classList.remove(...CLASSES);

/**
 * Plays the intro if the page was set up for it. Returns a promise that resolves when the page is final
 * (finished or skipped), or null if there is no intro to wait for.
 */
export function runIntro(): Promise<void> | null {
  const html = document.documentElement;
  if (!html.classList.contains('sh')) return null;
  clearTimeout((window as unknown as { __shWatch?: number }).__shWatch);

  const typed = document.querySelector<HTMLElement>('[data-typed]');
  const rest = document.querySelector<HTMLElement>('[data-rest]');
  const text = rest?.textContent ?? '';
  const search = location.search;
  let seen = false;
  try { seen = sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { /* private mode */ }
  const env: IntroEnv = {
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    forced: /[?&]intro=1\b/.test(search),
    off: /[?&]intro=0\b/.test(search),
    seen,
    restored: ['reload', 'back_forward'].includes((performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? ''),
    hash: location.hash,
    scrollY,
  };
  // the page was restored part-way down, say: the inline script could not know yet
  if (!typed || !rest || !text || !shouldRun(env)) {
    clear(html);
    return null;
  }

  const plan = introPlan(text);
  return new Promise<void>((resolve) => {
    const timers: number[] = [];
    let over = false;
    const skip = ['keydown', 'pointerdown', 'wheel', 'touchstart', 'scroll'] as const;

    const finish = () => {
      if (over) return;
      over = true;
      timers.forEach((id) => clearTimeout(id));
      skip.forEach((ev) => removeEventListener(ev, finish));
      document.removeEventListener('visibilitychange', onHide);
      try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch { /* private mode */ } // skipped counts as seen
      // back to the markup as it was served, and the finished page
      typed.textContent = '';
      rest.textContent = text;
      clear(html);
      resolve();
    };
    // leaving the tab mid-way: never come back to a half-typed page
    const onHide = () => { if (document.hidden) finish(); };

    // A skip works from the start, even before the first key.
    skip.forEach((ev) => addEventListener(ev, finish, { passive: true }));

    const play = () => {
      if (over) return;
      try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch { /* private mode */ }
      document.addEventListener('visibilitychange', onHide);
      const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
      plan.keys.forEach((ms, i) =>
        at(ms, () => {
          html.classList.add('sh-typing');
          typed.textContent = text.slice(0, i + 1);
          rest.textContent = text.slice(i + 1);
        }),
      );
      at(plan.enter, () => html.classList.add('sh-enter'));
      plan.steps.forEach((s) => at(s.at, () => html.classList.add(`sh-${s.name}`)));
      at(plan.total, finish);
    };

    // Not while nobody is looking (a link opened in a background tab), and not before the faces it is set in
    // have arrived, or the typed line and the name would change size under it (but only for a moment).
    whenVisible().then(() => fontsIn(700)).then(play);
  });
}

/** Resolves once the tab is in front (at once if it is). */
function whenVisible(): Promise<void> {
  if (!document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const on = () => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', on);
      resolve();
    };
    document.addEventListener('visibilitychange', on);
  });
}

/** Resolves when the start screen's fonts are loaded, or after `ms`, whichever is first. */
function fontsIn(ms: number): Promise<void> {
  const f = document.fonts;
  if (!f?.load) return Promise.resolve();
  const loads = Promise.all([
    f.load('500 12.8px "Geist Mono Variable"'),
    f.load('400 51px "Instrument Serif"'),
    f.load('italic 400 51px "Instrument Serif"'),
  ]).then(() => undefined, () => undefined);
  return Promise.race([loads, new Promise<void>((resolve) => { setTimeout(resolve, ms); })]);
}
