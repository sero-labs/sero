import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  designLibraryPathsFromHome,
  isSafeId,
  itemDir,
  itemRecordFile,
  jobFile,
  relativeToHome,
  resolveInsideHome,
  tombstoneFile,
  uploadDir,
  uploadManifestFile,
  type DesignLibraryPaths,
} from './paths';
import { discardUpload } from './uploads';

/**
 * Ids come from tool callers and end up in paths — one of which is handed to a
 * recursive delete. These cover the traversal directly, because `path.join`
 * gives no protection and the failure mode is destroying the profile.
 */

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-paths-'));
  paths = designLibraryPathsFromHome(path.join(home, 'apps', 'design-library'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const TRAVERSALS = [
  '../../..',
  '../../items',
  '..',
  '.',
  'a/../../b',
  'nested/id',
  '/absolute',
  '',
  'trailing/',
  '..\\windows',
];

describe('isSafeId', () => {
  it('rejects every traversal shape', () => {
    for (const id of TRAVERSALS) {
      expect(isSafeId(id), `${JSON.stringify(id)} must be rejected`).toBe(false);
    }
  });

  it('accepts the ids the plugin actually mints', () => {
    expect(isSafeId('1bad5a7d-655d-4c63-80f8-7b5dd15cfe7a')).toBe(true);
    expect(isSafeId('itm-ms2h7mko-wkzrkh')).toBe(true);
    expect(isSafeId('job-1')).toBe(true);
  });

  it('rejects an id long enough to be a path in disguise', () => {
    expect(isSafeId('a'.repeat(129))).toBe(false);
  });
});

describe('path helpers refuse to build a path from an unsafe id', () => {
  const builders: Array<[string, (id: string) => string]> = [
    ['itemDir', (id) => itemDir(paths, id)],
    ['itemRecordFile', (id) => itemRecordFile(paths, id)],
    ['jobFile', (id) => jobFile(paths, id)],
    ['uploadDir', (id) => uploadDir(paths, id)],
    ['uploadManifestFile', (id) => uploadManifestFile(paths, id)],
    ['tombstoneFile', (id) => tombstoneFile(paths, id)],
  ];

  for (const [name, build] of builders) {
    it(`${name} throws instead of escaping`, () => {
      for (const id of TRAVERSALS) {
        expect(() => build(id), `${name}(${JSON.stringify(id)})`).toThrow(/not a safe identifier/);
      }
    });
  }

  it('still builds the path for a legitimate id', () => {
    expect(relativeToHome(paths, itemRecordFile(paths, 'abc-123'))).toBe('items/abc-123/record.json');
  });
});

describe('discardUpload', () => {
  it('cannot delete outside the uploads directory', async () => {
    // The regression: `uploadId: '../../..'` used to resolve to the Sero home
    // and hand it to `rm -rf`.
    const bystander = path.join(home, 'profile-data.json');
    await writeFile(bystander, '{"important":true}', 'utf8');
    await mkdir(paths.uploadsDir, { recursive: true });

    await expect(discardUpload(paths, '../../..')).rejects.toThrow(/not a safe identifier/);
    await expect(access(bystander)).resolves.toBeUndefined();
    await expect(access(home)).resolves.toBeUndefined();
  });

  it('removes only the upload it was given', async () => {
    const keep = uploadDir(paths, 'keep-me');
    const drop = uploadDir(paths, 'drop-me');
    await mkdir(keep, { recursive: true });
    await mkdir(drop, { recursive: true });

    await discardUpload(paths, 'drop-me');

    await expect(access(keep)).resolves.toBeUndefined();
    await expect(access(drop)).rejects.toThrow();
  });
});

describe('resolveInsideHome', () => {
  it('refuses a relative path that climbs out', () => {
    expect(resolveInsideHome(paths, '../../secrets')).toBeNull();
    expect(resolveInsideHome(paths, 'items/../../../etc/passwd')).toBeNull();
  });

  it('resolves a path that stays inside', () => {
    expect(resolveInsideHome(paths, 'items/abc/original.png')).toBe(
      path.join(paths.home, 'items', 'abc', 'original.png'),
    );
  });
});
