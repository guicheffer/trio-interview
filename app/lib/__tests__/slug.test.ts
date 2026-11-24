import { describe, expect, test } from 'vitest';
import { toSlug } from '../slug';

describe('toSlug', () => {
  test('turns a typed name into a folder name', () => {
    expect(toSlug('smane jim')).toBe('smane-jim');
    expect(toSlug('  Ana María   Souza ')).toBe('ana-maria-souza');
    expect(toSlug('José_Silva.2')).toBe('jose_silva.2');
  });

  test('drops what a folder name cannot hold and the dashes at the ends', () => {
    expect(toSlug('--a/b\\c--')).toBe('abc');
    expect(toSlug('!!!')).toBe('');
  });
});
