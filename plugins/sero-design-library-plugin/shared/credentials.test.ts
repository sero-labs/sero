import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from './paths';
import { clearFalKey, falKeyStatus, resolveFalKey, storeFalKey } from './credentials';

describe('provider credentials', () => {
  let paths: DesignLibraryPaths;

  beforeEach(async () => {
    paths = designLibraryPathsFromHome(await mkdtemp(path.join(tmpdir(), 'design-library-cred-')));
  });

  afterEach(async () => {
    await rm(paths.home, { recursive: true, force: true });
  });

  it('reports missing when there is neither an environment nor a stored key', async () => {
    expect(await falKeyStatus(paths, {})).toBe('missing');
    expect(await resolveFalKey(paths, {})).toBeUndefined();
  });

  it('stores a key into a profile whose app directory does not exist yet', async () => {
    // The extension process writes this, and it cannot assume the runtime has
    // started and made the directory first.
    const untouched = designLibraryPathsFromHome(path.join(paths.home, 'apps', 'design-library'));

    await storeFalKey(untouched, 'stored-key');

    expect(await resolveFalKey(untouched, {})).toBe('stored-key');
  });

  it('prefers the environment over a stored key', async () => {
    await storeFalKey(paths, 'stored-key');

    expect(await resolveFalKey(paths, { FAL_KEY: 'env-key' })).toBe('env-key');
    expect(await falKeyStatus(paths, { FAL_KEY: 'env-key' })).toBe('env');
  });

  it('falls back to the stored key', async () => {
    await storeFalKey(paths, 'stored-key');

    expect(await resolveFalKey(paths, {})).toBe('stored-key');
    expect(await falKeyStatus(paths, {})).toBe('stored');
  });

  it('treats an empty environment variable as absent', async () => {
    await storeFalKey(paths, 'stored-key');

    // An exported-but-empty FAL_KEY is the shape a shell profile leaves behind,
    // and reading it as "the key is the empty string" would send an empty
    // Authorization header and report an auth failure the user cannot explain.
    expect(await resolveFalKey(paths, { FAL_KEY: '' })).toBe('stored-key');
    expect(await falKeyStatus(paths, { FAL_KEY: '' })).toBe('stored');
  });

  it('writes the key owner-readable only', async () => {
    await storeFalKey(paths, 'stored-key');

    expect((await stat(paths.secretsFile)).mode & 0o777).toBe(0o600);
  });

  it('tightens the mode when overwriting a permissive file', async () => {
    // `writeFile`'s mode applies only when it creates the file, so a key written
    // over a world-readable one would silently keep those permissions.
    await writeFile(paths.secretsFile, '{}', { mode: 0o644 });
    await storeFalKey(paths, 'stored-key');

    expect((await stat(paths.secretsFile)).mode & 0o777).toBe(0o600);
  });

  it('clears a stored key', async () => {
    await storeFalKey(paths, 'stored-key');
    await clearFalKey(paths);

    expect(await falKeyStatus(paths, {})).toBe('missing');
  });

  it('survives an unreadable secrets file rather than throwing', async () => {
    await writeFile(paths.secretsFile, 'not json at all');

    // The status is read whenever Settings opens, so throwing here would take
    // down the one page that could fix the file.
    expect(await falKeyStatus(paths, {})).toBe('missing');
    expect(await resolveFalKey(paths, {})).toBeUndefined();
  });

  it('keeps the key out of anything the UI can read', async () => {
    await storeFalKey(paths, 'super-secret');

    // The secrets file is the only place it exists. State is read by the UI.
    const written = await readFile(paths.secretsFile, 'utf8');
    expect(written).toContain('super-secret');
    const state = await readFile(paths.stateFile, 'utf8').catch(() => '');
    expect(state).not.toContain('super-secret');
  });
});
