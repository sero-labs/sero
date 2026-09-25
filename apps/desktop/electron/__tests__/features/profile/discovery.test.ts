import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  discoverProfiles,
  isProfileDirectory,
  selectSalvageCandidates,
} from '@electron/features/profile/discovery';

let root = '';
const registryPath = () => path.join(root, 'profiles.json');

async function makeProfile(relativePath: string): Promise<string> {
  const full = path.join(root, relativePath);
  await fs.mkdir(path.join(full, 'agent'), { recursive: true });
  await fs.writeFile(path.join(full, 'agent', 'workspaces.json'), '{"workspaces":[]}');
  return full;
}

async function writeBrokenBackup(timestamp: string, profiles: unknown[]): Promise<void> {
  await fs.writeFile(
    path.join(root, `profiles.broken-${timestamp}.json`),
    JSON.stringify({ version: 1, activeProfileId: null, profiles }),
  );
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-discovery-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('isProfileDirectory', () => {
  it('accepts a directory with an agent child', async () => {
    const full = await makeProfile('profiles/work');
    expect(isProfileDirectory(full)).toBe(true);
  });

  it('rejects a directory without an agent child', async () => {
    const full = path.join(root, 'profiles', 'empty');
    await fs.mkdir(full, { recursive: true });
    expect(isProfileDirectory(full)).toBe(false);
  });
});

describe('discoverProfiles', () => {
  it('finds profile directories under the managed root and skips the rest', async () => {
    await makeProfile('profiles/alpha');
    await makeProfile('profiles/beta');
    await fs.mkdir(path.join(root, 'profiles', 'not-a-profile'), { recursive: true });

    const found = discoverProfiles({ seroRoot: root, registryPath: registryPath() });
    expect(found.map((profile) => profile.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('skips a path the registry already references', async () => {
    const full = await makeProfile('profiles/alpha');
    await fs.writeFile(registryPath(), JSON.stringify({
      version: 1,
      activeProfileId: 'a',
      profiles: [{ id: 'a', name: 'Alpha', path: full, createdAt: '2026-01-01T00:00:00.000Z' }],
    }));

    expect(discoverProfiles({ seroRoot: root, registryPath: registryPath() })).toEqual([]);
  });

  it('offers a recorded path outside the managed root', async () => {
    const custom = await makeProfile('custom/studio');
    await writeBrokenBackup('2026-09-20T13-08-18-575Z', [
      { id: 'abc', name: 'Studio', path: custom, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);

    expect(discoverProfiles({ seroRoot: root, registryPath: registryPath() })).toEqual([
      expect.objectContaining({ id: 'abc', name: 'Studio', path: custom }),
    ]);
  });

  it('skips a recorded profile whose directory is gone', async () => {
    await writeBrokenBackup('2026-09-20T13-08-18-575Z', [
      { id: 'gone', name: 'Gone', path: path.join(root, 'missing'), createdAt: '2026-01-01T00:00:00.000Z' },
    ]);

    expect(discoverProfiles({ seroRoot: root, registryPath: registryPath() })).toEqual([]);
  });

  it('returns one entry when both sources resolve to the same path', async () => {
    const full = await makeProfile('profiles/work');
    await writeBrokenBackup('2026-09-20T13-08-18-575Z', [
      { id: 'recorded', name: 'Recorded Work', path: full, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const found = discoverProfiles({ seroRoot: root, registryPath: registryPath() });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'recorded', name: 'Recorded Work', path: full });
  });

  it('reads only the newest broken backup', async () => {
    const older = await makeProfile('custom/old');
    const newer = await makeProfile('custom/new');
    await writeBrokenBackup('2026-01-01T00-00-00-000Z', [
      { id: 'old', name: 'Old', path: older, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    await writeBrokenBackup('2026-09-20T13-08-18-575Z', [
      { id: 'new', name: 'New', path: newer, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const found = discoverProfiles({ seroRoot: root, registryPath: registryPath() });
    expect(found.map((profile) => profile.id)).toEqual(['new']);
  });

  it('reports a last-modified timestamp for each entry', async () => {
    await makeProfile('profiles/alpha');
    const found = discoverProfiles({ seroRoot: root, registryPath: registryPath() });
    expect(Number.isNaN(Date.parse(found[0].lastModified))).toBe(false);
  });

  it('offers the default-root profile when it holds profile data', async () => {
    await fs.mkdir(path.join(root, 'agent'), { recursive: true });
    await fs.writeFile(path.join(root, 'agent', 'settings.json'), '{}');

    const found = discoverProfiles({ seroRoot: root, registryPath: registryPath() });

    expect(found).toEqual([
      expect.objectContaining({ name: 'Default', path: root }),
    ]);
  });

  it('does not offer a fresh installation that only has an empty agent directory', async () => {
    await fs.mkdir(path.join(root, 'agent'), { recursive: true });

    expect(discoverProfiles({ seroRoot: root, registryPath: registryPath() })).toEqual([]);
  });

  it('carries recorded ownership and onboarding state', async () => {
    const custom = await makeProfile('custom/studio');
    await writeBrokenBackup('2026-09-20T13-08-18-575Z', [
      {
        id: 'abc',
        name: 'Studio',
        path: custom,
        createdAt: '2026-01-01T00:00:00.000Z',
        folderProvenance: 'custom',
        onboarded: true,
      },
    ]);

    const found = discoverProfiles({ seroRoot: root, registryPath: registryPath() });

    expect(found).toHaveLength(1);
    expect(found[0].folderProvenance).toBe('custom');
    expect(found[0].onboarded).toBe(true);
  });

  it('leaves ownership and onboarding unknown for a scanned profile', async () => {
    await makeProfile('profiles/alpha');

    const found = discoverProfiles({ seroRoot: root, registryPath: registryPath() });

    expect(found[0].folderProvenance).toBeUndefined();
    expect(found[0].onboarded).toBeUndefined();
  });
});

describe('selectSalvageCandidates', () => {
  it('keeps only entries whose directory exists', async () => {
    const a = await makeProfile('profiles/a');
    const b = await makeProfile('profiles/b');
    await fs.writeFile(registryPath(), JSON.stringify({
      version: 1,
      activeProfileId: 'a',
      profiles: [
        { id: 'a', name: 'A', path: a, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b', name: 'B', path: b, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'c', name: 'C', path: path.join(root, 'missing'), createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    }));

    const candidates = selectSalvageCandidates(registryPath());
    expect(candidates.map((candidate) => candidate.id).sort()).toEqual(['a', 'b']);
  });

  it('returns nothing for malformed JSON', async () => {
    await fs.writeFile(registryPath(), '{broken-json');
    expect(selectSalvageCandidates(registryPath())).toEqual([]);
  });
});
