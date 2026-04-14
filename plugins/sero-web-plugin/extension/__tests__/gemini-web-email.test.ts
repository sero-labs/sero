import { describe, expect, it } from 'vitest';
import {
  buildCookieHeader,
  extractEmailFromGeminiHtml,
  extractEmailFromListAccounts,
  findFirstUserEmail,
} from '../gemini-web-email';

describe('gemini web email helpers', () => {
  it('builds a cookie header from non-empty cookie values', () => {
    expect(
      buildCookieHeader({
        '__Secure-1PSID': 'abc',
        '__Secure-1PSIDTS': 'def',
        ignored: '',
      }),
    ).toBe('__Secure-1PSID=abc; __Secure-1PSIDTS=def');
  });

  it('prefers user email fields from Gemini HTML over Google-internal addresses', () => {
    const html = [
      '<html>',
      '<body>',
      '  <script>{"email":"googlers@google.com","displayEmail":"person@example.com"}</script>',
      '</body>',
      '</html>',
    ].join('');

    expect(extractEmailFromGeminiHtml(html)).toBe('person@example.com');
  });

  it('extracts the first non-Google account from ListAccounts payloads', () => {
    const payload = JSON.stringify([
      ['googlers@google.com'],
      {
        nested: ['person@example.com'],
      },
    ]);

    expect(extractEmailFromListAccounts(`)]}'\n${payload}`)).toBe('person@example.com');
  });

  it('falls back to the first user email in raw HTML when structured fields are missing', () => {
    const html = 'Contact googlers@google.com or real.person@example.com for access';
    expect(findFirstUserEmail(html)).toBe('real.person@example.com');
  });
});
