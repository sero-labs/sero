import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  readAuthFile,
  readDotEnvFile,
  readJsonFile,
} from '@electron/features/doctor/profile-state/read';

const tmpRoot = mkdtempSync(path.join(tmpdir(), 'sero-doctor-test-'));

afterAll(() => {
  try {
    require('fs').rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('profile-state.readJsonFile', () => {
  it('returns parsed value for valid JSON', () => {
    const file = path.join(tmpRoot, 'good.json');
    writeFileSync(file, JSON.stringify({ a: 1 }));
    const result = readJsonFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it('returns parse error for invalid JSON', () => {
    const file = path.join(tmpRoot, 'bad.json');
    writeFileSync(file, '{ not json }');
    const result = readJsonFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('parse');
  });

  it('returns missing for non-existent files', () => {
    const result = readJsonFile(path.join(tmpRoot, 'nope.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('missing');
  });
});

describe('profile-state.readAuthFile', () => {
  it('exposes only the names of credential entries — values are deleted', () => {
    const file = path.join(tmpRoot, 'auth.json');
    writeFileSync(
      file,
      JSON.stringify({
        anthropic: { apiKey: 'sk-AAAAAAAAAAAAAAAAAAAA' },
        openai: { apiKey: 'sk-BBBBBBBBBBBBBBBBBBBB' },
      }),
    );
    const result = readAuthFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ keys: ['anthropic', 'openai'] });
      expect(JSON.stringify(result.value)).not.toContain('sk-');
    }
  });

  it('rejects non-object payloads with a schema error', () => {
    const file = path.join(tmpRoot, 'auth-array.json');
    writeFileSync(file, JSON.stringify(['nope']));
    const result = readAuthFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('schema');
  });
});

describe('profile-state.readDotEnvFile', () => {
  it('returns only the variable names', () => {
    const file = path.join(tmpRoot, '.env');
    writeFileSync(
      file,
      [
        '# comment',
        'OPENAI_API_KEY=sk-AAAAAAAAAAAAAAAAAAAA',
        'ANTHROPIC_API_KEY="sk-BBBBBBBBBBBBBBBBBBBB"',
        '',
        'GOOGLE_API_KEY=value-without-quotes',
      ].join('\n'),
    );
    const result = readDotEnvFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.keys).toEqual([
        'ANTHROPIC_API_KEY',
        'GOOGLE_API_KEY',
        'OPENAI_API_KEY',
      ]);
      expect(JSON.stringify(result.value)).not.toContain('sk-');
    }
  });

  it('returns parse error when no key is parseable', () => {
    const file = path.join(tmpRoot, '.env-bad');
    writeFileSync(file, 'this is not a key value file');
    const result = readDotEnvFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('parse');
  });

  it('tolerates the shell-style `export KEY=value` prefix', () => {
    const file = path.join(tmpRoot, '.env-export');
    writeFileSync(
      file,
      [
        'export OPENAI_API_KEY=sk-AAAAAAAAAAAAAAAAAAAA',
        'export ANTHROPIC_API_KEY="sk-BBBBBBBBBBBBBBBBBBBB"',
        'PLAIN=value',
      ].join('\n'),
    );
    const result = readDotEnvFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.keys).toEqual([
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
        'PLAIN',
      ]);
    }
  });
});
