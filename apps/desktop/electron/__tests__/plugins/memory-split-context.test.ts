/**
 * Split context injection tests.
 *
 * Verifies that buildPriorityContextSplit correctly separates
 * static memory context (for system prompt) from dynamic QMD
 * search results (for per-turn message injection).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildPriorityContext,
  buildPriorityContextSplit,
} from '../../../../../plugins/sero-memory-plugin/extension/priority-context';
import {
  serializeMemoryEntries,
  nowTimestamp,
} from '../../../../../plugins/sero-memory-plugin/extension/memory-format';

let root: string;
const originalSeroHome = process.env.SERO_HOME;
const originalNoSearch = process.env.SERO_MEMORY_NO_SEARCH;

beforeAll(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-split-ctx-'));
  root = path.join(tmp, 'workspaces', 'global');
  await fs.mkdir(root, { recursive: true });
  process.env.SERO_HOME = tmp;
  // Disable QMD search in tests — no binary available
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
    id: `mem-split${String(i).padStart(3, '0')}`,
    hasId: true,
    type: e.type,
    text: e.text,
    line: i,
    raw: '',
  }));
  await writeFile('MEMORY.md', serializeMemoryEntries(parsed, nowTimestamp()));
}

describe('buildPriorityContextSplit', () => {
  it('returns static context with IDENTITY and MEMORY but no search section', async () => {
    await writeFile('IDENTITY.md', '<!-- last updated: 2026-04-01 -->\n# Identity\n\n- **Name:** Sero');
    await seedMemory([{ type: 'fact', text: 'Uses TypeScript' }]);

    const { staticContext, searchContext } = await buildPriorityContextSplit(root, 'hello');

    expect(staticContext).toContain('IDENTITY.md');
    expect(staticContext).toContain('Sero');
    expect(staticContext).toContain('MEMORY.md');
    expect(staticContext).toContain('TypeScript');
    // No QMD available in tests, so search is empty
    expect(searchContext).toBe('');
  });

  it('returns empty search context when QMD is unavailable', async () => {
    await seedMemory([{ type: 'fact', text: 'Some fact' }]);
    const { searchContext } = await buildPriorityContextSplit(root, 'find me something');
    expect(searchContext).toBe('');
  });

  it('static context does NOT contain "auto-retrieved" search results header', async () => {
    await writeFile('IDENTITY.md', '<!-- last updated: 2026-04-01 -->\n# Identity\n\n- **Name:** Sero');
    await seedMemory([{ type: 'fact', text: 'A fact' }]);

    const { staticContext } = await buildPriorityContextSplit(root, 'hello');

    expect(staticContext).not.toContain('auto-retrieved');
    expect(staticContext).not.toContain('Relevant memories');
  });

  it('returns empty strings when no memory files exist', async () => {
    const { staticContext, searchContext } = await buildPriorityContextSplit(root, 'hello');
    expect(staticContext).toBe('');
    expect(searchContext).toBe('');
  });
});

describe('buildPriorityContext compatibility', () => {
  it('returns combined output matching split parts', async () => {
    await writeFile('IDENTITY.md', '<!-- last updated: 2026-04-01 -->\n# Identity\n\n- **Name:** Sero');
    await seedMemory([{ type: 'preference', text: 'Prefers dark mode' }]);

    const combined = await buildPriorityContext(root, 'hello');
    const { staticContext } = await buildPriorityContextSplit(root, 'hello');

    // With no search results, combined should equal static context
    expect(combined).toBe(staticContext);
  });

  it('returns empty string when no memory files exist', async () => {
    const combined = await buildPriorityContext(root, 'hello');
    expect(combined.trim()).toBe('');
  });
});
