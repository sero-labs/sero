/**
 * Memory context injection integration tests.
 *
 * Covers Test 12 from the manual testing guide: verifies that memory
 * content is injected into the system prompt via buildPriorityContext.
 *
 * Also validates the memory instruction text (prompt tuning for Issue 3).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildPriorityContext } from '@plugins/sero-memory-plugin/extension/context-injector';
import { getMemoryInstructions } from '@plugins/sero-memory-plugin/extension/memory-instructions';
import {
  serializeMemoryEntries,
  nowTimestamp,
} from '@plugins/sero-memory-plugin/extension/memory-format';

let root: string;
const originalSeroHome = process.env.SERO_HOME;
const originalNoSearch = process.env.SERO_MEMORY_NO_SEARCH;

beforeAll(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-ctx-test-'));
  root = path.join(tmp, 'workspaces', 'global');
  await fs.mkdir(root, { recursive: true });
  process.env.SERO_HOME = tmp;
  // Disable QMD search in tests (no binary available)
  process.env.SERO_MEMORY_NO_SEARCH = '1';
});

beforeEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
});

afterAll(async () => {
  process.env.SERO_HOME = originalSeroHome;
  process.env.SERO_MEMORY_NO_SEARCH = originalNoSearch;
  await fs.rm(path.dirname(path.dirname(root)), { recursive: true, force: true }).catch(() => {});
});

async function writeFile(relativePath: string, content: string): Promise<void> {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function seedMemory(entries: Array<{ type: string; text: string }>): Promise<void> {
  const parsed = entries.map((e, i) => ({
    id: `mem-ctx${String(i).padStart(3, '0')}`,
    hasId: true,
    type: e.type,
    text: e.text,
    line: i,
    raw: '',
  }));
  await writeFile('MEMORY.md', serializeMemoryEntries(parsed, nowTimestamp()));
}

// ── Test 12: Context injection ─────────────────────────────────

describe('Test 12 — Context injection', () => {
  it('injects MEMORY.md content into the context block', async () => {
    await seedMemory([
      { type: 'fact', text: 'Project uses React 19' },
      { type: 'decision', text: 'Chose Zustand for state' },
    ]);

    const context = await buildPriorityContext(root, 'What stack are we using?');

    expect(context).toContain('React 19');
    expect(context).toContain('Zustand');
    expect(context).toContain('MEMORY.md');
  });

  it('injects IDENTITY.md when present', async () => {
    await writeFile('IDENTITY.md', '<!-- last updated: 2026-04-01 -->\n# Identity\n\n- **Name:** Sero\n- **Style:** Helpful');

    const context = await buildPriorityContext(root, 'hello');

    expect(context).toContain('IDENTITY.md');
    expect(context).toContain('Sero');
  });

  it('injects USER.md when present', async () => {
    await writeFile('USER.md', '<!-- last updated: 2026-04-01 -->\n# User\n\n- **Name:** Dan\n- **Role:** Developer');

    const context = await buildPriorityContext(root, 'hello');

    expect(context).toContain('USER.md');
    expect(context).toContain('Dan');
  });

  it('returns empty string when no memory files exist', async () => {
    const context = await buildPriorityContext(root, 'hello');
    expect(context.trim()).toBe('');
  });

  it('includes capacity percentage in MEMORY.md header', async () => {
    await seedMemory([
      { type: 'fact', text: 'Some stored knowledge' },
    ]);

    const context = await buildPriorityContext(root, 'test');

    // Header format: ### MEMORY.md [X% — Y/Z chars]
    expect(context).toMatch(/MEMORY\.md \[\d+%/);
  });
});

describe('Frozen snapshot mode', () => {
  it('keeps long-term memory stable across turns in frozen mode', async () => {
    await writeFile('IDENTITY.md', '# Identity\n\n- **Name:** Sero');
    await writeFile('USER.md', '# User\n\n- **Name:** Dan');
    await seedMemory([
      { type: 'preference', text: 'TypeScript over JavaScript' },
    ]);

    const turnOne = await buildPriorityContext(root, 'hello', 'session-frozen', 'frozen');
    await seedMemory([
      { type: 'preference', text: 'TypeScript over JavaScript' },
      { type: 'preference', text: 'Prefers concise PR descriptions' },
    ]);

    const turnTwo = await buildPriorityContext(root, 'what do you remember?', 'session-frozen', 'frozen');

    expect(turnTwo).toBe(turnOne);
    expect(turnTwo).not.toContain('Prefers concise PR descriptions');
  });

  it('rebuilds long-term memory on each turn in live mode', async () => {
    await writeFile('IDENTITY.md', '# Identity\n\n- **Name:** Sero');
    await writeFile('USER.md', '# User\n\n- **Name:** Dan');
    await seedMemory([
      { type: 'preference', text: 'TypeScript over JavaScript' },
    ]);

    const turnOne = await buildPriorityContext(root, 'hello', 'session-live', 'live');
    await seedMemory([
      { type: 'preference', text: 'TypeScript over JavaScript' },
      { type: 'preference', text: 'Prefers concise PR descriptions' },
    ]);

    const turnTwo = await buildPriorityContext(root, 'what do you remember?', 'session-live', 'live');

    expect(turnTwo).not.toBe(turnOne);
    expect(turnTwo).toContain('Prefers concise PR descriptions');
  });
});

// ── Memory instructions content (Issue 3 prompt tuning) ────────

describe('Memory instructions — bash prevention (Issue 3)', () => {
  it('instructs to use sero-cli memory commands instead of direct file access', () => {
    const instructions = getMemoryInstructions();

    expect(instructions).toContain('sero-cli');
    expect(instructions).toContain('never read/write/grep managed files');
    expect(instructions).toContain('SCRATCHPAD.md');
    expect(instructions).toContain('bash');
  });

  it('still routes recall queries through memory_search when QMD is unavailable', () => {
    const instructions = getMemoryInstructions();

    expect(instructions).toContain('### Retrieval');
    expect(instructions).toContain('sero memory_search');
    expect(instructions).toContain('ONE precise query');
    expect(instructions).toContain('do NOT fall back to bash/read');
    expect(instructions).toContain('sero scratchpad list');
  });

  it('includes storage guidelines', () => {
    const instructions = getMemoryInstructions();

    expect(instructions).toContain('type tags');
    expect(instructions).toContain('[decision]');
    expect(instructions).toContain('[preference]');
    expect(instructions).toContain('capacity');
    expect(instructions).toContain('sero memory config');
  });
});
