// Which pet lives on the line: the dog or the secretary bird (bird-art.ts). The choice comes from the URL
// (?pet=bird, ?pet=dog, or just ?bird), then from what the visitor picked with the switch in the top bar earlier
// in this tab (sessionStorage 'pet': so a reload keeps their pick, and a new visit does not), and otherwise
// it is a coin flip, so each visit meets one or the other.

export type Pet = 'dog' | 'bird';

export const PETS: readonly Pet[] = ['dog', 'bird'];

export const PET_NAMES: Record<Pet, string> = { dog: 'dog', bird: 'secretary bird' };

export const isPet = (v: unknown): v is Pet => v === 'dog' || v === 'bird';

/** `roll` is a number in [0, 1): the coin flip, given as an argument so that it can be tested. */
export function choosePet(search: string, saved: string | null | undefined, roll: number = Math.random()): Pet {
  const q = new URLSearchParams(search);
  const want = q.get('pet');
  if (isPet(want)) return want;
  if (q.has('bird')) return 'bird';
  if (isPet(saved)) return saved;
  return roll < 0.5 ? 'dog' : 'bird';
}

export const otherPet = (p: Pet): Pet => (p === 'dog' ? 'bird' : 'dog');
