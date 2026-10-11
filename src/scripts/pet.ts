// Which pet lives on the line. The dog is the default; the secretary bird is the alternative (bird-art.ts).
// The choice comes from the URL (?pet=bird, ?pet=dog, or just ?bird), then from what the visitor picked last
// time with the switch in the top bar (localStorage 'pet'), and is the dog otherwise.

export type Pet = 'dog' | 'bird';

export const PETS: readonly Pet[] = ['dog', 'bird'];

export const PET_NAMES: Record<Pet, string> = { dog: 'dog', bird: 'secretary bird' };

export const isPet = (v: unknown): v is Pet => v === 'dog' || v === 'bird';

export function choosePet(search: string, saved: string | null | undefined): Pet {
  const q = new URLSearchParams(search);
  const want = q.get('pet');
  if (isPet(want)) return want;
  if (q.has('bird')) return 'bird';
  if (isPet(saved)) return saved;
  return 'dog';
}

export const otherPet = (p: Pet): Pet => (p === 'dog' ? 'bird' : 'dog');
