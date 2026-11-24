import { describe, expect, test } from 'vitest';
import { tokenFromLocation, withoutToken } from '../accessLink';

describe('tokenFromLocation', () => {
  test('reads the secret after the #', () => {
    expect(tokenFromLocation({ hash: '#k=abc123', search: '' })).toBe('abc123');
  });

  test('also accepts ?k= for chat apps that drop the #', () => {
    expect(tokenFromLocation({ hash: '', search: '?k=abc123' })).toBe('abc123');
  });

  test('returns null when there is none, and cuts an absurdly long one', () => {
    expect(tokenFromLocation({ hash: '', search: '' })).toBeNull();
    expect(tokenFromLocation({ hash: '#other=1', search: '?x=2' })).toBeNull();
    expect(tokenFromLocation({ hash: `#k=${'a'.repeat(500)}`, search: '' })?.length).toBe(200);
  });
});

describe('withoutToken', () => {
  test('drops the secret and keeps the rest of the address', () => {
    expect(withoutToken({ pathname: '/', search: '?k=abc' })).toBe('/');
    expect(withoutToken({ pathname: '/x', search: '?k=abc&y=1' })).toBe('/x?y=1');
    expect(withoutToken({ pathname: '/x', search: '' })).toBe('/x');
  });
});
