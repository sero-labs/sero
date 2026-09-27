/**
 * Memory context injection integration tests.
 *
 * Covers Test 12 from the manual testing guide: verifies that memory
 * content is injected into the system prompt via buildPriorityContext.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildPriorityContext } from '@plugins/sero-memory-plugin/extension/priority-context';
import { getMemoryInstructions } from '@plugins/sero-memory-plugin/extension/memory-instructions';
import {
  serializeMemoryEntries,
  nowTimestamp,
} from '@plugins/sero-memory-plugin/extension/memory-format';

let root: string;
const originalSeroHome = process.env.SERO_HOME;

beforeAll(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-ctx-test-'));
  root = path.join(tmp, 'workspaces', 'global');
  await fs.mkdir(root, { recursive: true });
  process.env.SERO_HOME = tmp;
});

beforeEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
});

afterAll(async () => {
  process.env.SERO_HOME = originalSeroHome;
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

    const context = await buildPriorityContext(root);

    expect(context).toContain('React 19');
    expect(context).toContain('Zustand');
    expect(context).toContain('MEMORY.md');
  });

  it('injects IDENTITY.md when present', async () => {
    await writeFile('IDENTITY.md', '<!-- last updated: 2026-04-01 -->\n# Identity\n\n- **Name:** Sero\n- **Style:** Helpful');

    const context = await buildPriorityContext(root);

    expect(context).toContain('IDENTITY.md');
    expect(context).toContain('Sero');
  });

  it('injects USER.md when present', async () => {
    await writeFile('USER.md', '<!-- last updated: 2026-04-01 -->\n# User\n\n- **Name:** Dan\n- **Role:** Developer');

    const context = await buildPriorityContext(root);

    expect(context).toContain('USER.md');
    expect(context).toContain('Dan');
  });

  it('returns empty string when no memory files exist', async () => {
    const context = await buildPriorityContext(root);
    expect(context.trim()).toBe('');
  });

  it('includes capacity percentage in MEMORY.md header', async () => {
    await seedMemory([
      { type: 'fact', text: 'Some stored knowledge' },
    ]);

    const context = await buildPriorityContext(root);

    // Header format: ### MEMORY.md [X% — Y/Z chars]
    expect(context).toMatch(/MEMORY\.md \[\d+%/);
  });
});

describe('Session snapshot', () => {
  it('keeps memory stable across turns in one session', async () => {
    await writeFile('IDENTITY.md', '# Identity\n\n- **Name:** Sero');
    await writeFile('USER.md', '# User\n\n- **Name:** Dan');
    await seedMemory([
      { type: 'preference', text: 'TypeScript over JavaScript' },
    ]);

    const turnOne = await buildPriorityContext(root, 'session-frozen');
    await seedMemory([
      { type: 'preference', text: 'TypeScript over JavaScript' },
      { type: 'preference', text: 'Prefers concise PR descriptions' },
    ]);

    const turnTwo = await buildPriorityContext(root, 'session-frozen');

    expect(turnTwo).toBe(turnOne);
    expect(turnTwo).not.toContain('Prefers concise PR descriptions');
  });

  it('shows memory written in one session to the next session', async () => {
    await seedMemory([
      { type: 'preference', text: 'TypeScript over JavaScript' },
    ]);
    await buildPriorityContext(root, 'session-before');

    await seedMemory([
      { type: 'preference', text: 'TypeScript over JavaScript' },
      { type: 'preference', text: 'Prefers concise PR descriptions' },
    ]);

    expect(await buildPriorityContext(root, 'session-after')).toContain('Prefers concise PR descriptions');
  });
});

describe('Memory instructions', () => {
  it('routes memory changes through sero-cli instead of direct file access', () => {
    const instructions = getMemoryInstructions();

    expect(instructions).toContain('sero-cli');
    expect(instructions).toContain('never with bash, read, write, or edit tools');
  });
});
