import { describe, expect, it } from 'vitest';
import { choosePet, otherPet } from './pet';

describe('choosePet', () => {
  it('is a coin flip when nothing says otherwise: the lower half of the roll is the dog, the upper the bird', () => {
    expect(choosePet('', null, 0)).toBe('dog');
    expect(choosePet('', null, 0.499)).toBe('dog');
    expect(choosePet('', null, 0.5)).toBe('bird');
    expect(choosePet('', null, 0.999)).toBe('bird');
    expect(choosePet('?layout=lanes', undefined, 0.9)).toBe('bird');
  });

  it('really is random by default, and gives both pets', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(choosePet('', null));
    expect([...seen].sort()).toEqual(['bird', 'dog']);
  });

  it('takes the saved choice, whatever the roll', () => {
    expect(choosePet('', 'bird', 0)).toBe('bird');
    expect(choosePet('', 'dog', 0.9)).toBe('dog');
  });

  it('ignores a saved value that is not a pet', () => {
    expect(choosePet('', 'cat', 0.1)).toBe('dog');
    expect(choosePet('', '', 0.9)).toBe('bird');
  });

  it('lets the URL win over what was saved and over the roll', () => {
    expect(choosePet('?pet=dog', 'bird', 0.9)).toBe('dog');
    expect(choosePet('?pet=bird', 'dog', 0.1)).toBe('bird');
    expect(choosePet('?bird', 'dog', 0.1)).toBe('bird');
  });

  it('prefers ?pet= over the bare ?bird', () => {
    expect(choosePet('?bird&pet=dog', null, 0.9)).toBe('dog');
  });

  it('ignores ?pet= with a value that is not a pet', () => {
    expect(choosePet('?pet=cat', 'bird', 0.1)).toBe('bird');
    expect(choosePet('?pet=cat', null, 0.1)).toBe('dog');
  });
});

describe('otherPet', () => {
  it('swaps the two', () => {
    expect(otherPet('dog')).toBe('bird');
    expect(otherPet('bird')).toBe('dog');
  });
});
