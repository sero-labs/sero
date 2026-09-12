import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { publishSessionFork, releaseSessionReferences, runRetentionExclusive } from '@electron/features/tool-capture/lifecycle';
import { OutputCapture } from '@electron/features/tool-capture/capture';
import {
  collectCaptureIdsFromEntries,
  forkReferencePath,
  readForkReferences,
  removeForkReferences,
  writeForkReferences,
} from '@electron/features/tool-capture/fork-references';
import {
  nodeCaptureInventorySource,
  parseForkReferenceDocument,
  planCaptureCleanup,
  readCaptureInventory,
  sweepOrphanedCaptures,
} from '@electron/features/tool-capture/retention';

const PARENT = '019e21b7-609e-7147-921d-9a81c69975f2';
const FORK = '019e21b7-acba-75fc-9805-b597e5d80a30';
const OTHER = '019e27ff-1111-2222-3333-444455556666';

let root: string;
let sessionDir: string;
let captureRoot: string;
let rtkStateRoot: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-retention-'));
  sessionDir = path.join(root, 'sessions');
  captureRoot = path.join(root, 'captures');
  rtkStateRoot = path.join(root, 'rtk');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(captureRoot, { recursive: true });
  fs.mkdirSync(rtkStateRoot, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function sessionFileName(sessionId: string, timestamp = '2026-05-13T14-22-06-494Z'): string {
  return `${timestamp}_${sessionId}.jsonl`;
}

function writeSessionFile(sessionId: string, captureIds: Array<{ captureId: string; producerSessionId: string }>): string {
  const header = JSON.stringify({ type: 'session', version: 3, id: sessionId, timestamp: '2026-05-13T14:22:06.494Z', cwd: '/ws' });
  const lines = captureIds.map(({ captureId, producerSessionId }, index) => JSON.stringify({
    type: 'message',
    id: `m${index}`,
    parentId: null,
    timestamp: '2026-05-13T14:22:07.000Z',
    message: {
      role: 'toolResult',
      toolCallId: `c${index}`,
      toolName: 'bash',
      content: [{ type: 'text', text: 'output' }],
      details: {
        exitCode: 0,
        capture: {
          version: 1,
          captureId,
          producerSessionId,
          complete: true,
          combined: { stream: 'combined', runtimePath: '/x/combined.log', hostPath: '/x/combined.log', bytes: 7 },
        },
      },
      isError: false,
      timestamp: 1,
    },
  }));
  const filePath = path.join(sessionDir, sessionFileName(sessionId));
  fs.writeFileSync(filePath, [header, ...lines].join('\n') + '\n', 'utf8');
  return filePath;
}

function writeCapture(sessionId: string, captureId: string, mtimeMs?: number): string {
  const directory = path.join(captureRoot, encodeURIComponent(sessionId), captureId);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'combined.log'), 'output\n');
  if (mtimeMs !== undefined) {
    const seconds = mtimeMs / 1000;
    fs.utimesSync(directory, seconds, seconds);
  }
  return directory;
}

function writeRtkState(sessionId: string, mtimeMs?: number): string {
  const directory = path.join(rtkStateRoot, encodeURIComponent(sessionId));
  fs.mkdirSync(path.join(directory, 'tee'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'history.db'), '');
  if (mtimeMs !== undefined) {
    const seconds = mtimeMs / 1000;
    fs.utimesSync(directory, seconds, seconds);
  }
  return directory;
}

function sweep(overrides: Parameters<typeof sweepOrphanedCaptures>[0] = {}) {
  return sweepOrphanedCaptures({
    captureRoot,
    rtkStateRoot,
    sessionDir,
    graceMs: 0,
    ...overrides,
  });
}

/** Wait for a capture's first write to create its directory. */
async function waitForDirectory(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (fs.existsSync(directory)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${directory}`);
}

describe('capture reference inventory', () => {
  it('reads references from session files and fork sidecars', async () => {
    writeSessionFile(PARENT, [{ captureId: 'cap-parent', producerSessionId: PARENT }]);
    await writeForkReferences(path.join(sessionDir, sessionFileName(FORK)), FORK, ['cap-parent', 'cap-other']);

    const inventory = await readCaptureInventory(nodeCaptureInventorySource(sessionDir));

    expect(inventory.complete).toBe(true);
    expect([...inventory.referencedCaptureIds].sort()).toEqual(['cap-other', 'cap-parent']);
    expect(inventory.sessionIds.has(PARENT)).toBe(true);
    expect(inventory.forkReferenceFiles).toHaveLength(1);
  });

  it('reports an incomplete inventory when the session directory cannot be listed', async () => {
    const inventory = await readCaptureInventory({
      listSessionFiles: async () => { throw new Error('EACCES'); },
      listForkReferenceFiles: async () => [],
      readTextFile: async () => '',
      fileExists: async () => false,
    });

    expect(inventory.complete).toBe(false);
    expect(inventory.reason).toContain('session inventory unavailable');
  });

  it('reports an incomplete inventory when one session file cannot be read', async () => {
    const inventory = await readCaptureInventory({
      listSessionFiles: async () => ['/sessions/a.jsonl'],
      listForkReferenceFiles: async () => [],
      readTextFile: async () => { throw new Error('EIO'); },
      fileExists: async () => false,
    });

    expect(inventory.complete).toBe(false);
    expect(inventory.reason).toContain('incomplete');
  });

  it('rejects an unreadable fork reference document', () => {
    expect(parseForkReferenceDocument('not json')).toBeNull();
    expect(parseForkReferenceDocument('{"captures":"nope"}')).toBeNull();
    expect(parseForkReferenceDocument('{"version":1,"captures":["a","",1]}')).toEqual(['a']);
  });

  it('collects capture ids from branch entries only', () => {
    const entries = [
      { type: 'message', message: { role: 'user', content: 'hi' } },
      {
        type: 'message',
        message: {
          role: 'toolResult',
          details: { capture: { version: 1, captureId: 'cap-1', producerSessionId: PARENT } },
        },
      },
      {
        type: 'message',
        message: {
          role: 'toolResult',
          details: { capture: { version: 99, captureId: 'cap-future', producerSessionId: PARENT } },
        },
      },
      { type: 'label', targetId: 'x', label: 'y' },
    ];

    expect(collectCaptureIdsFromEntries(entries)).toEqual(['cap-1']);
  });
});

describe('capture cleanup', () => {
  it('keeps a capture that a running command owns until its result is published', async () => {
    const capture = new OutputCapture({
      producerSessionId: OTHER,
      captureId: 'cap-running',
      captureRoot,
    });
    const directory = capture.directoryPath;
    void capture.write('stdout', Buffer.from('still running\n', 'utf8'));
    await waitForDirectory(directory);

    // No session file references this capture yet: the command has not finished.
    // Age alone made it collectable, which removed a capture mid-write.
    await expect(sweep()).resolves.toMatchObject({ removedCaptures: [] });
    expect(fs.existsSync(directory)).toBe(true);

    // The record proves the capture is on disk, and the reported result is what
    // protects it from here on.
    await expect(capture.finish()).resolves.toMatchObject({ complete: true });
    await expect(sweep()).resolves.toMatchObject({ removedCaptures: [] });

    capture.release();
    await expect(sweep()).resolves.toMatchObject({ removedCaptures: [directory] });
    expect(fs.existsSync(directory)).toBe(false);
  });

  it('removes an unreferenced capture but keeps a referenced one', async () => {    writeCapture(PARENT, 'cap-kept');
    writeCapture(OTHER, 'cap-orphan');
    writeSessionFile(PARENT, [{ captureId: 'cap-kept', producerSessionId: PARENT }]);

    const result = await sweep();

    expect(result.deferred).toBe(false);
    expect(result.removedCaptures).toEqual([path.join(captureRoot, encodeURIComponent(OTHER), 'cap-orphan')]);
    expect(fs.existsSync(path.join(captureRoot, encodeURIComponent(PARENT), 'cap-kept'))).toBe(true);
  });

  it('keeps a parent capture that only a surviving fork references', async () => {
    // The parent's session file is gone; a fork inherited its capture.
    writeCapture(PARENT, 'cap-inherited');
    await writeForkReferences(path.join(sessionDir, sessionFileName(FORK)), FORK, ['cap-inherited']);

    const result = await sweep();

    expect(result.removedCaptures).toEqual([]);
    expect(fs.existsSync(path.join(captureRoot, encodeURIComponent(PARENT), 'cap-inherited'))).toBe(true);
  });

  it('keeps a parentless fork reference and removes the capture only after the fork sidecar is gone', async () => {
    writeCapture(PARENT, 'cap-inherited');
    const forkSessionPath = path.join(sessionDir, sessionFileName(FORK));
    await writeForkReferences(forkSessionPath, FORK, ['cap-inherited']);

    // No session file exists for the fork yet, so its sidecar is the only reference.
    expect((await sweep()).removedCaptures).toEqual([]);

    await removeForkReferences(forkSessionPath);
    const afterRemoval = await sweep();
    expect(afterRemoval.removedCaptures).toEqual([path.join(captureRoot, encodeURIComponent(PARENT), 'cap-inherited')]);
  });

  it('forks of forks keep the original inherited reference', async () => {
    writeCapture(PARENT, 'cap-inherited');
    // A fork of a fork copies the same tool result, so the capture id is unchanged.
    await writeForkReferences(path.join(sessionDir, sessionFileName(FORK)), FORK, ['cap-inherited']);

    await writeSessionFile(FORK, [{ captureId: 'cap-inherited', producerSessionId: PARENT }]);
    const secondFork = '019e2222-aaaa-bbbb-cccc-ddddeeeeffff';
    writeSessionFile(secondFork, [{ captureId: 'cap-inherited', producerSessionId: PARENT }]);
    fs.rmSync(path.join(sessionDir, sessionFileName(FORK)));

    const result = await sweep();
    expect(result.removedCaptures).toEqual([]);
    expect(fs.existsSync(path.join(captureRoot, encodeURIComponent(PARENT), 'cap-inherited'))).toBe(true);
  });

  it('cleans up the last reference without affecting unrelated sessions', async () => {
    writeCapture(PARENT, 'cap-parent');
    writeCapture(OTHER, 'cap-other');
    writeSessionFile(OTHER, [{ captureId: 'cap-other', producerSessionId: OTHER }]);

    const result = await sweep();

    expect(result.removedCaptures).toEqual([path.join(captureRoot, encodeURIComponent(PARENT), 'cap-parent')]);
    expect(fs.existsSync(path.join(captureRoot, encodeURIComponent(OTHER), 'cap-other'))).toBe(true);
  });

  it('defers every removal when the inventory is unreadable', async () => {
    writeCapture(PARENT, 'cap-orphan');

    const result = await sweep({
      source: {
        listSessionFiles: async () => { throw new Error('EACCES'); },
        listForkReferenceFiles: async () => [],
        readTextFile: async () => '',
        fileExists: async () => false,
      },
    });

    expect(result.deferred).toBe(true);
    expect(result.removedCaptures).toEqual([]);
    expect(fs.existsSync(path.join(captureRoot, encodeURIComponent(PARENT), 'cap-orphan'))).toBe(true);
  });

  it('never removes data inside the grace window', async () => {
    writeCapture(PARENT, 'cap-fresh');
    writeRtkState(PARENT);

    const result = await sweep({ graceMs: 60_000 });

    expect(result.removedCaptures).toEqual([]);
    expect(result.removedRtkStates).toEqual([]);
  });

  it('removes a fork sidecar once its session file exists', async () => {
    const forkSessionPath = path.join(sessionDir, sessionFileName(FORK));
    await writeForkReferences(forkSessionPath, FORK, ['cap-inherited']);
    expect(fs.existsSync(forkReferencePath(forkSessionPath))).toBe(true);

    writeSessionFile(FORK, [{ captureId: 'cap-inherited', producerSessionId: PARENT }]);
    const result = await sweep();

    expect(result.removedForkReferences).toEqual([forkReferencePath(forkSessionPath)]);
    expect(fs.existsSync(forkReferencePath(forkSessionPath))).toBe(false);
  });
});

describe('host RTK state retention', () => {
  it('retains the producer state while an inherited capture can reference it', async () => {
    writeCapture(PARENT, 'cap-inherited');
    writeRtkState(PARENT);
    await writeForkReferences(path.join(sessionDir, sessionFileName(FORK)), FORK, ['cap-inherited']);

    const result = await sweep();

    expect(result.removedRtkStates).toEqual([]);
    expect(fs.existsSync(path.join(rtkStateRoot, encodeURIComponent(PARENT)))).toBe(true);
  });

  it('removes the producer state once the session and its inherited captures are gone', async () => {
    writeRtkState(PARENT);

    const result = await sweep();

    expect(result.removedRtkStates).toEqual([path.join(rtkStateRoot, encodeURIComponent(PARENT))]);
  });

  it('keeps state for a session that still has a file', async () => {
    writeSessionFile(OTHER, []);
    writeRtkState(OTHER);

    const result = await sweep();

    expect(result.removedRtkStates).toEqual([]);
  });

  it('keeps state for a fork whose session file is still deferred', async () => {
    // The Pi writer defers a forked file until its first assistant message, so
    // the sidecar is the only proof that this fork is alive.
    writeRtkState(FORK);
    await writeForkReferences(path.join(sessionDir, sessionFileName(FORK)), FORK, ['cap-inherited']);
    writeCapture(PARENT, 'cap-inherited');

    const result = await sweep();

    expect(result.removedRtkStates).toEqual([]);
    expect(fs.existsSync(path.join(rtkStateRoot, encodeURIComponent(FORK)))).toBe(true);
  });
});

describe('fork and deletion overlap', () => {
  it('never removes captures inherited by a fork committed before the sweep', async () => {
    writeCapture(PARENT, 'cap-inherited');
    const forkSessionPath = path.join(sessionDir, sessionFileName(FORK));

    const fork = publishSessionFork(async () => {
      await Promise.resolve();
      await writeForkReferences(forkSessionPath, FORK, ['cap-inherited']);
      return 'committed';
    });
    const deletionSweep = releaseSessionReferences({
      captureRoot,
      rtkStateRoot,
      sessionDir,
      graceMs: 0,
    });

    await expect(fork).resolves.toBe('committed');
    await expect(deletionSweep).resolves.toMatchObject({ removedCaptures: [] });
    expect(fs.existsSync(path.join(captureRoot, encodeURIComponent(PARENT), 'cap-inherited'))).toBe(true);
  });

  it('serialises retention work so operations do not interleave', async () => {
    const order: string[] = [];
    const first = runRetentionExclusive(async () => {
      order.push('first:start');
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push('first:end');
    });
    const second = runRetentionExclusive(async () => {
      order.push('second:start');
      order.push('second:end');
    });

    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });
});

describe('planCaptureCleanup', () => {
  it('keeps a capture whose producer key matches a retained reference', () => {
    const plan = planCaptureCleanup({
      inventory: {
        complete: true,
        referencedCaptureIds: new Set(['cap-kept']),
        sessionIds: new Set(),
        forkReferenceFiles: [],
      },
      captures: [
        { captureId: 'cap-kept', sessionKey: 'keeping', directory: '/captures/keeping/cap-kept', modifiedMs: 0 },
        { captureId: 'cap-gone', sessionKey: 'gone', directory: '/captures/gone/cap-gone', modifiedMs: 0 },
      ],
      rtkStates: [
        { sessionKey: 'keeping', directory: '/rtk/keeping', modifiedMs: 0 },
        { sessionKey: 'gone', directory: '/rtk/gone', modifiedMs: 0 },
      ],
      existingSessionFiles: new Set(),
      graceMs: 0,
      now: 1,
    });

    expect(plan.captureDirectories).toEqual(['/captures/gone/cap-gone']);
    expect(plan.rtkStateDirectories).toEqual(['/rtk/gone']);
  });

  it('never selects a capture that a running command owns', () => {
    const plan = planCaptureCleanup({
      inventory: {
        complete: true,
        referencedCaptureIds: new Set(),
        sessionIds: new Set(),
        forkReferenceFiles: [],
      },
      captures: [
        { captureId: 'cap-running', sessionKey: 'busy', directory: '/captures/busy/cap-running', modifiedMs: 0 },
        { captureId: 'cap-gone', sessionKey: 'gone', directory: '/captures/gone/cap-gone', modifiedMs: 0 },
      ],
      rtkStates: [],
      existingSessionFiles: new Set(),
      graceMs: 0,
      now: 10_000_000,
      activeDirectories: new Set(['/captures/busy/cap-running']),
    });

    // Both are unreferenced and far past the grace window, so only the registry
    // distinguishes the running command's capture from the orphan.
    expect(plan.captureDirectories).toEqual(['/captures/gone/cap-gone']);
  });
});

describe('fork reference documents', () => {
  it('round-trips inherited references and tolerates a missing document', async () => {
    const sessionPath = path.join(sessionDir, sessionFileName(FORK));
    await writeForkReferences(sessionPath, FORK, ['cap-a', 'cap-b']);

    await expect(readForkReferences(sessionPath)).resolves.toEqual(['cap-a', 'cap-b']);
    await expect(readForkReferences(path.join(sessionDir, 'missing.jsonl'))).resolves.toEqual([]);
    expect(collectCaptureIdsFromEntries([])).toEqual([]);
  });

  it('does not write a sidecar when nothing was inherited', async () => {
    const sessionPath = path.join(sessionDir, sessionFileName(FORK));
    await writeForkReferences(sessionPath, FORK, []);

    expect(fs.existsSync(forkReferencePath(sessionPath))).toBe(false);
  });
});
