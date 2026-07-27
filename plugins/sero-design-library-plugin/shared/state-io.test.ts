import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mutateRecord, mutateState, readState } from './state-io';
import { DEFAULT_STATE } from './state';

let root = '';

async function tempStateFile(): Promise<string> {
  root = await mkdtemp(path.join(os.tmpdir(), 'dl-state-'));
  return path.join(root, 'state.json');
}

afterEach(() => {
  root = '';
});

describe('mutateState', () => {
  it('creates the document and starts the revision counter', async () => {
    const file = await tempStateFile();
    const published = await mutateState(file, (current) => ({ ...current, nextRequestId: 5 }));

    expect(published.stateRevision).toBe(1);
    expect(published.nextRequestId).toBe(5);
    expect((await readState(file))?.stateRevision).toBe(1);
  });

  it('serialises concurrent writers without losing an update', async () => {
    const file = await tempStateFile();
    await mutateState(file, (current) => current);

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        mutateState(file, (current) => ({
          ...current,
          requests: [
            ...current.requests,
            { id: index + 1, action: 'noop', payload: {}, requestedAt: index },
          ],
        }))),
    );

    const final = await readState(file);
    expect(final?.requests).toHaveLength(12);
    expect(new Set(final?.requests.map((entry) => entry.id)).size).toBe(12);
  });

  it('retries a stale writer instead of clobbering newer state', async () => {
    const file = await tempStateFile();
    await mutateState(file, (current) => ({ ...current, nextRequestId: 1 }));

    let firstPass = true;
    const published = await mutateState(file, (current) => {
      if (firstPass) {
        firstPass = false;
        // Simulate another process publishing between read and write.
        void writeFile(
          file,
          JSON.stringify({ ...DEFAULT_STATE, stateRevision: 99, nextRequestId: 42 }),
          'utf8',
        );
      }
      return { ...current, nextRequestId: current.nextRequestId + 1 };
    });

    const raw = JSON.parse(await readFile(file, 'utf8')) as { stateRevision: number };
    expect(published.stateRevision).toBe(raw.stateRevision);
    expect(published.stateRevision).toBeGreaterThan(1);
  });
});

describe('mutateRecord', () => {
  it('guards each record with its own revision', async () => {
    const file = path.join(path.dirname(await tempStateFile()), 'record.json');

    const first = await mutateRecord<{ revision: number; value: number }>(file, (current) => ({
      revision: 0,
      value: (current?.value ?? 0) + 1,
    }));
    const second = await mutateRecord<{ revision: number; value: number }>(file, (current) => ({
      revision: 0,
      value: (current?.value ?? 0) + 1,
    }));

    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(second.value).toBe(2);
  });

  it('applies every concurrent record write exactly once', async () => {
    const file = path.join(path.dirname(await tempStateFile()), 'counter.json');

    await Promise.all(
      Array.from({ length: 10 }, () =>
        mutateRecord<{ revision: number; value: number }>(file, (current) => ({
          revision: 0,
          value: (current?.value ?? 0) + 1,
        }))),
    );

    const final = await mutateRecord<{ revision: number; value: number }>(file, (current) => current!);
    expect(final.value).toBe(10);
  });
});
