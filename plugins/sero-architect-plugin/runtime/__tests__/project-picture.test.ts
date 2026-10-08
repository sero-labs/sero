import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ProjectRecord } from '../../shared/record';
import { FIXTURES } from '../../ui/__preview__/fixture';
import { readPicture } from '../project-picture';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

/** A project in a real folder, with one step whose checks saved a capture at `capture`. */
async function project(capture: (folder: string) => string): Promise<ProjectRecord> {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'architect-picture-'));
  folders.push(folder);
  const base = FIXTURES.build!;
  const step = base.milestones[0]!;
  return {
    ...base,
    folder,
    milestones: [{ ...step, evidence: { ...step.evidence!, preview: { route: '/', smokePassed: true, capturePath: capture(folder) } } }],
  };
}

const evidenceFile = (folder: string) => path.join(folder, '.sero', 'apps', 'architect', 'evidence', 'm1', 'abc.png');

async function save(file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, PNG);
}

describe('the pictures a board reads', () => {
  it('does not read a picture that links outside the project', async () => {
    const record = await project(evidenceFile);
    const outside = await mkdtemp(path.join(os.tmpdir(), 'architect-outside-'));
    folders.push(outside);
    await save(path.join(outside, 'secret.png'));
    await mkdir(path.dirname(evidenceFile(record.folder)), { recursive: true });
    await symlink(path.join(outside, 'secret.png'), evidenceFile(record.folder));
    expect((await readPicture(record, record.milestones[0]!.id)).ok).toBe(false);
  });

  it('returns the capture a step saved', async () => {
    const record = await project(evidenceFile);
    await save(evidenceFile(record.folder));
    const picture = await readPicture(record, record.milestones[0]!.id);
    expect(picture.ok && picture.dataUrl).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
  });

  it('refuses a capture path outside the project evidence folder', async () => {
    const record = await project((folder) => path.join(folder, 'secrets.png'));
    await save(path.join(record.folder, 'secrets.png'));
    expect((await readPicture(record, record.milestones[0]!.id)).ok).toBe(false);
  });

  it('returns the last browser screenshot when no step is named, and nothing when there is none', async () => {
    const record = await project(evidenceFile);
    expect((await readPicture(record, undefined)).ok).toBe(false);
    await save(path.join(record.folder, '.sero', 'tmp', 'automation-browser-shot.png'));
    expect((await readPicture(record, undefined)).ok).toBe(true);
  });

  it('does not send again a picture the view already holds', async () => {
    const record = await project(evidenceFile);
    const file = path.join(record.folder, '.sero', 'tmp', 'automation-browser-shot.png');
    await save(file);
    const first = await readPicture(record, undefined);
    if (!first.ok) throw new Error('the first read must succeed');
    expect((await readPicture(record, undefined, first.at)).ok).toBe(false);
    const later = new Date(Date.parse(first.at) + 5000);
    await utimes(file, later, later);
    expect((await readPicture(record, undefined, first.at)).ok).toBe(true);
  });
});
