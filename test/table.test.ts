import { describe, expect, it } from 'vitest';
import { numberIn } from '../src/table';

describe('numberIn', () => {
  it('reads numbers as people write them', () => {
    expect(numberIn('€4,820')).toBe(4820);
    expect(numberIn('$1,234.50')).toBe(1234.5);
    expect(numberIn('1 234,50 €')).toBe(1234.5);
    expect(numberIn('1.234,5')).toBe(1234.5);
    expect(numberIn('1.234.567')).toBe(1234567);
    expect(numberIn('1,5 kg')).toBe(1.5);
    expect(numberIn('-3%')).toBe(-3);
    expect(numberIn('\u221212')).toBe(-12);
    expect(numberIn('.5')).toBe(0.5);
    expect(numberIn('0')).toBe(0);
  });
  it('says when there is none', () => {
    expect(numberIn('n/a')).toBeNaN();
    expect(numberIn('')).toBeNaN();
    expect(numberIn('-')).toBeNaN();
  });
});
