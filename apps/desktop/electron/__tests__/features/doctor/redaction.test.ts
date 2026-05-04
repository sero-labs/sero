import os from 'os';
import { describe, expect, it } from 'vitest';
import { hashPath, scrub } from '@electron/features/doctor/engine/redaction';

describe('redaction.scrub', () => {
  it('strips fields named `value`/`secret`/`token`/`apiKey`/`password`', () => {
    const input = {
      auth: {
        value: 'sk-abc',
        secret: 'shh',
        token: 'shh',
        apiKey: 'shh',
        password: 'shh',
        Authorization: 'Bearer abc',
        cookie: 'a=b',
      },
    };
    const out = scrub(input) as { auth: Record<string, string> };
    for (const k of ['value', 'secret', 'token', 'apiKey', 'password', 'Authorization', 'cookie']) {
      expect(out.auth[k]).toBe('[redacted]');
    }
  });

  it('replaces well-known credential patterns embedded in strings', () => {
    const sample = {
      message: 'token sk-AAAAAAAAAAAAAAAAAA used here',
      gh: 'ghp_AAAAAAAAAAAAAAAAAAAA',
      bearer: 'Authorization: Bearer eyJhbGciOiJI',
    };
    const out = scrub(sample) as Record<string, string>;
    expect(out.message).not.toContain('sk-AAAAAAAAAAAAAAAAAA');
    expect(out.message).toContain('[redacted]');
    expect(out.gh).not.toContain('ghp_');
    expect(out.bearer).not.toContain('Bearer eyJh');
  });

  it('replaces 32+ char hex strings (regression)', () => {
    const samples = ['a'.repeat(32), '0123456789abcdef0123456789abcdef', 'short'];
    for (const sample of samples.slice(0, 2)) {
      const out = scrub({ s: sample }) as { s: string };
      expect(out.s).toBe('[redacted]');
    }
    expect((scrub({ s: 'short' }) as { s: string }).s).toBe('short');
  });

  it('rewrites paths under home directory to ~/...', () => {
    const home = os.homedir();
    const out = scrub({ path: `${home}/foo/bar` }) as { path: string };
    expect(out.path).not.toContain(home);
    expect(out.path).toBe('~/foo/bar');
  });

  it('does not leak the example OPENAI_API_KEY in the serialised output', () => {
    const fakeKey = 'sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const fake = {
      details: {
        info: `OPENAI_API_KEY=${fakeKey}`,
      },
    };
    const serialised = JSON.stringify(scrub(fake));
    expect(serialised).not.toContain('sk-');
  });

  it('handles cycles without throwing', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { name: 'b', a };
    a.b = b;
    expect(() => scrub(a)).not.toThrow();
  });
});

describe('redaction.hashPath', () => {
  it('returns a 12-char hex digest', () => {
    const hash = hashPath('/Users/example/.sero-ui');
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is deterministic for the same input', () => {
    const a = hashPath('/Users/example/.sero-ui');
    const b = hashPath('/Users/example/.sero-ui');
    expect(a).toBe(b);
  });
});
