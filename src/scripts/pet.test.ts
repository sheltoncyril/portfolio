import { describe, expect, it } from 'vitest';
import { choosePet, otherPet } from './pet';

describe('choosePet', () => {
  it('is the dog when nothing says otherwise', () => {
    expect(choosePet('', null)).toBe('dog');
    expect(choosePet('?layout=lanes', undefined)).toBe('dog');
  });

  it('takes the saved choice', () => {
    expect(choosePet('', 'bird')).toBe('bird');
    expect(choosePet('', 'dog')).toBe('dog');
  });

  it('ignores a saved value that is not a pet', () => {
    expect(choosePet('', 'cat')).toBe('dog');
    expect(choosePet('', '')).toBe('dog');
  });

  it('lets the URL win over what was saved', () => {
    expect(choosePet('?pet=dog', 'bird')).toBe('dog');
    expect(choosePet('?pet=bird', 'dog')).toBe('bird');
    expect(choosePet('?bird', 'dog')).toBe('bird');
  });

  it('prefers ?pet= over the bare ?bird', () => {
    expect(choosePet('?bird&pet=dog', null)).toBe('dog');
  });

  it('ignores ?pet= with a value that is not a pet', () => {
    expect(choosePet('?pet=cat', 'bird')).toBe('bird');
    expect(choosePet('?pet=cat', null)).toBe('dog');
  });
});

describe('otherPet', () => {
  it('swaps the two', () => {
    expect(otherPet('dog')).toBe('bird');
    expect(otherPet('bird')).toBe('dog');
  });
});
