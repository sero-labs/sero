/**
 * Research artifacts.
 *
 * A contract shows a bounded summary and a reference, so the reference has to
 * exist and has to be reachable from the directory the owner session runs in.
 * A write that fails must cost the reference and never the finding.
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attachResearchArtifact, researchArtifactRef, writeResearchArtifact } from '../research-artifact';
import type { ResearchResult } from '../../shared/record';
import { buildingProject, cleanupHosts, fakeHost, storeFor } from './helpers';

afterEach(cleanupHosts);

const folders: string[] = [];
function tempFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'architect-research-'));
  folders.push(dir);
  return dir;
}
afterEach(() => {
  while (folders.length > 0) fs.rmSync(folders.pop()!, { recursive: true, force: true });
});

const result = (overrides: Partial<ResearchResult> = {}): ResearchResult => ({
  id: 'res_1',
  question: 'Which grid shape suits the renderer?',
  stoppingCondition: 'enough evidence to decide',
  result: 'A hex grid needs an offset coordinate system.\n',
  costUsd: 0.2,
  completedAt: '2026-09-14T09:00:00.000Z',
  ...overrides,
});

describe('the research report on disk', () => {
  it('writes the report under the project folder and returns a path relative to it', async () => {
    const folder = tempFolder();
    const reference = await writeResearchArtifact(folder, result());
    expect(reference).toBe(researchArtifactRef('res_1'));
    // Relative to the owner's working directory, which is the project folder.
    expect(reference).toBe('.sero/apps/architect/research/res_1.md');
    const written = fs.readFileSync(path.join(folder, reference!), 'utf8');
    expect(written).toContain('Which grid shape suits the renderer?');
    expect(written).toContain('enough evidence to decide');
    expect(written).toContain('A hex grid needs an offset coordinate system.');
  });

  it('reports failure instead of throwing when the report cannot be saved', async () => {
    // A file where the folder should be: the directory cannot be created.
    const parent = tempFolder();
    const blocked = path.join(parent, 'blocked');
    fs.writeFileSync(blocked, 'not a directory\n');
    expect(await writeResearchArtifact(blocked, result())).toBeNull();
  });
});

describe('the reference recorded on a finding', () => {
  it('attaches the path once the report is saved', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const folder = tempFolder();
    await store.write(buildingProject({ folder, research: [result()] }));

    await attachResearchArtifact(store, 'proj_1', 'res_1');

    const saved = await store.read('proj_1');
    expect(saved?.research[0]?.artifactPath).toBe('.sero/apps/architect/research/res_1.md');
    expect(fs.existsSync(path.join(folder, '.sero/apps/architect/research/res_1.md'))).toBe(true);
  });

  it('keeps the finding and records no reference when the report cannot be written', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const parent = tempFolder();
    const blocked = path.join(parent, 'blocked');
    fs.writeFileSync(blocked, 'not a directory\n');
    await store.write(buildingProject({ folder: blocked, research: [result()] }));

    await attachResearchArtifact(store, 'proj_1', 'res_1');

    const saved = await store.read('proj_1');
    // The finding survives; only the reference is missing, and the contract says
    // so rather than pointing at a file that is not there.
    expect(saved?.research[0]?.result).toBe(result().result);
    expect(saved?.research[0]?.artifactPath).toBeUndefined();
  });

  it('does nothing for a finding that is not on the record', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    await store.write(buildingProject({ folder: tempFolder(), research: [result()] }));
    await attachResearchArtifact(store, 'proj_1', 'res_missing');
    expect((await store.read('proj_1'))?.research[0]?.artifactPath).toBeUndefined();
  });
});
