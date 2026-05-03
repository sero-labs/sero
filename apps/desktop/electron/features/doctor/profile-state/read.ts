/**
 * Lenient filesystem reader for profile config files.
 *
 * Never throws. Each call returns either { ok: true, value } or
 * { ok: false, error: typed }. For credential-bearing files, only the
 * set of keys is returned — values are actively deleted in-memory.
 */

import { readFileSync } from 'fs';
import type { ReadResult, ReadError } from './types';

function classify(err: NodeJS.ErrnoException): ReadError {
  if (err.code === 'ENOENT') return { kind: 'missing', message: 'File does not exist.' };
  if (err.code === 'EACCES' || err.code === 'EPERM') {
    return { kind: 'denied', message: 'Permission denied reading file.' };
  }
  return { kind: 'parse', message: err.message };
}

export function readJsonFile(path: string): ReadResult<unknown> {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    return { ok: false, error: classify(err as NodeJS.ErrnoException), path };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return { ok: true, value: parsed, path };
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'parse', message: (err as Error).message },
      path,
    };
  }
}

/**
 * Parse `auth.json` and return only the names of stored credentials.
 *
 * The full structure is parsed, then the `value`/credential bodies are
 * actively deleted as defence-in-depth before the function returns.
 */
export function readAuthFile(path: string): ReadResult<{ keys: string[] }> {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    return { ok: false, error: classify(err as NodeJS.ErrnoException), path };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'parse', message: (err as Error).message },
      path,
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      error: { kind: 'schema', message: 'auth.json is not an object.' },
      path,
    };
  }

  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj).sort();

  // Defence-in-depth: scrub every credential body so the parsed reference
  // cannot leak values even if it escapes via a stray `details` field.
  for (const key of keys) {
    const entry = obj[key];
    if (entry && typeof entry === 'object') {
      for (const k of Object.keys(entry as Record<string, unknown>)) {
        delete (entry as Record<string, unknown>)[k];
      }
    }
    delete obj[key];
  }

  return { ok: true, value: { keys }, path };
}

/**
 * Parse a `.env` file and return only the variable names.
 *
 * Values are never stored or returned. Lines that don't match
 * `KEY=VALUE` are ignored.
 */
export function readDotEnvFile(path: string): ReadResult<{ keys: string[] }> {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    return { ok: false, error: classify(err as NodeJS.ErrnoException), path };
  }

  const keys = new Set<string>();
  let parseFailed = false;
  for (const rawLine of raw.split('\n')) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    // Tolerate the common shell-style `export KEY=value` prefix.
    if (line.startsWith('export ') || line.startsWith('export\t')) {
      line = line.slice('export '.length).trimStart();
    }
    const eq = line.indexOf('=');
    if (eq === -1) {
      parseFailed = true;
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      parseFailed = true;
      continue;
    }
    keys.add(key);
  }

  if (parseFailed && keys.size === 0) {
    return {
      ok: false,
      error: { kind: 'parse', message: '.env file contains no parseable lines.' },
      path,
    };
  }

  return { ok: true, value: { keys: [...keys].sort() }, path };
}
