import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';

import { shellQuote } from '../../../ipc/editor/shell-quote';

describe('shellQuote', () => {
  it('wraps simple values in single quotes', () => {
    expect(shellQuote('foo')).toBe(`'foo'`);
  });

  it('preserves spaces inside quotes', () => {
    expect(shellQuote('hello world')).toBe(`'hello world'`);
  });

  it('escapes embedded single quotes via the POSIX trick', () => {
    expect(shellQuote(`it's`)).toBe(`'it'\\''s'`);
  });

  it('escapes multiple embedded single quotes', () => {
    expect(shellQuote(`a'b'c`)).toBe(`'a'\\''b'\\''c'`);
  });

  it('does not interpret shell metacharacters', () => {
    // $, backtick, and ; are inert inside single quotes — they should
    // appear verbatim in the output.
    expect(shellQuote('$(rm -rf /)')).toBe(`'$(rm -rf /)'`);
    expect(shellQuote('`whoami`')).toBe(`'\`whoami\`'`);
    expect(shellQuote('a; rm b')).toBe(`'a; rm b'`);
  });

  it('handles empty strings', () => {
    expect(shellQuote('')).toBe(`''`);
  });

  it('handles backslashes literally', () => {
    // Inside single quotes, backslashes are not escape characters, so
    // a literal backslash stays as a single backslash.
    expect(shellQuote('a\\b')).toBe(`'a\\b'`);
  });

  it('round-trips through /bin/sh -c echo for tricky paths', () => {
    // Sanity check: feed the quoted output to a real shell and confirm
    // it echoes the original string back. Catches subtle escaping bugs.
    const samples = [
      'plain',
      'with space',
      `it's a path`,
      `weird $name & 'thing'`,
      '/tmp/dir with $HOME and `cmd`',
      `dir/sub/'quoted'/file.txt`,
      'a\\b\\c',
    ];
    for (const sample of samples) {
      const quoted = shellQuote(sample);
      const out = execFileSync('/bin/sh', ['-c', `printf %s ${quoted}`], {
        encoding: 'utf8',
      });
      expect(out).toBe(sample);
    }
  });

  it('blocks command injection in mv-style commands', () => {
    // The whole point of shellQuote: an attacker-controlled path with
    // a single quote and a chained command must not actually run the
    // chained command. Verify by spawning /bin/sh and checking that
    // only the quoted token is echoed.
    const malicious = `foo'; touch /tmp/sero-test-pwn-$$; echo 'bar`;
    const quoted = shellQuote(malicious);
    const out = execFileSync('/bin/sh', ['-c', `printf %s ${quoted}`], {
      encoding: 'utf8',
    });
    expect(out).toBe(malicious);
  });
});
