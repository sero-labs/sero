import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const GOG_SEARCH_PATHS = [
  '/opt/homebrew/bin/gog',
  '/usr/local/bin/gog',
  path.join(homedir(), '.local/bin/gog'),
  path.join(homedir(), 'go/bin/gog'),
] as const;

const GOG_EXTRA_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  path.join(homedir(), '.local/bin'),
  path.join(homedir(), 'go/bin'),
] as const;

let resolvedGogPath: string | null | undefined;

export function resolveGogBinaryPath(): string {
  if (resolvedGogPath !== undefined) return resolvedGogPath ?? 'gog';

  for (const candidate of GOG_SEARCH_PATHS) {
    if (existsSync(candidate)) {
      resolvedGogPath = candidate;
      return candidate;
    }
  }

  resolvedGogPath = null;
  return 'gog';
}

export function buildGogPath(existingPath: string = process.env.PATH || ''): string {
  return [...new Set([...GOG_EXTRA_PATHS, ...existingPath.split(':').filter(Boolean)])].join(':');
}
