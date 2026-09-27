import { describe, expect, it } from 'vitest';
import { addLink, personalLink, readLink, tokenFromInput, withoutAdd } from './link';

const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';

describe('links', () => {
  it('round-trips a personal link', () => {
    const url = personalLink('https://x.io/app/', token);
    expect(readLink(new URL(url).hash).token).toBe(token);
    expect(tokenFromInput(url)).toBe(token);
    expect(tokenFromInput(`  ${token} `)).toBe(token);
    expect(tokenFromInput('nonsense')).toBeUndefined();
  });

  it('round-trips an add link with non-ASCII text', () => {
    const json = JSON.stringify({ owned: [{ text: 'Café-set é' }] });
    const url = addLink('https://x.io/app/', json);
    expect(readLink(new URL(url).hash).add).toBe(json);
  });

  it('drops add but keeps the token', () => {
    expect(withoutAdd(`#k=${token}&add=abc`)).toBe(`#k=${token}`);
    expect(withoutAdd('#add=abc')).toBe('');
  });

  it('ignores a malformed token', () => {
    expect(readLink('#k=<script>').token).toBeUndefined();
  });
});
