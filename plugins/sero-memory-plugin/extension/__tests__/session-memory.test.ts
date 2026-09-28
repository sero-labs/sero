import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The native index is not loaded in unit tests; search runs on keywords.
vi.mock('../qmd-index', async (importOriginal) => ({
  ...await importOriginal<typeof import('../qmd-index')>(),
  warmUp: vi.fn(async () => false),
  acquireIndex: vi.fn(async () => false),
  releaseIndex: vi.fn(async () => undefined),
  refreshIndex: vi.fn(async () => undefined),
}));

import { getIdentityPath, getMemoryPath, getUserPath, resolveMemoryRoot } from '../memory-manager';
import { releaseIndex } from '../qmd-index';
import { RECALL_MESSAGE_TYPE } from '../recall';
import { memoryRegistry } from '../registry';
import { createSession } from './harness';

const FIXTURES = path.join(__dirname, 'fixtures', 'legacy-memory');
const originalEnv = { SERO_HOME: process.env.SERO_HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };

const saveOnMatch = {
  action: 'save',
  content: 'JS/TS projects use pnpm.',
  behaviour: 'Run pnpm, never npm or yarn, to add or install packages.',
  type: 'preference',
  scope: 'global',
  delivery: 'on-match',
  terms: 'pnpm, dependency, package manager',
};

describe('memory in a chat session', () => {
  let seroHome = '';
  let workspace = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-session-'));
    workspace = path.join(seroHome, 'project');
    await mkdir(workspace);
    process.env.SERO_HOME = seroHome;
    process.env.PI_CODING_AGENT_DIR = path.join(seroHome, 'agent');
    memoryRegistry().gitChecks.clear();
    await mkdir(resolveMemoryRoot(), { recursive: true });
    await writeFile(getIdentityPath(resolveMemoryRoot()), '# Identity\n\n- **Name:** Sero\n');
    await writeFile(getUserPath(resolveMemoryRoot()), '# User\n');
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalEnv.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = originalEnv.PI_CODING_AGENT_DIR;
    await rm(seroHome, { recursive: true, force: true });
  });

  describe('snapshot', () => {
    it('keeps the system prompt byte-identical across turns after a save', async () => {
      const session = createSession({ sessionId: 's1', cwd: workspace });
      await session.start();
      const first = await session.prompt('hello');

      await session.tool('memory', { ...saveOnMatch, delivery: 'pinned' });
      await session.tool('scratchpad', { action: 'add', text: 'Migrate the auth tests' });
      const second = await session.prompt('next message');

      expect(second.systemPrompt).toBe(first.systemPrompt);
    });

    it('shows the old MEMORY.md facts in the first session after the update', async () => {
      await writeFile(getMemoryPath(resolveMemoryRoot()), await readFile(path.join(FIXTURES, 'v2-triple-id.md'), 'utf8'));
      const session = createSession({ sessionId: 's1', cwd: workspace });
      await session.start();

      const { systemPrompt } = await session.prompt('hello');

      expect(systemPrompt).toContain('### Unsorted memories');
      expect(systemPrompt).toContain('Prefer strong typing / explicit types');
      expect(systemPrompt).toContain('Do not run pnpm install unless the user explicitly asks');
      expect(systemPrompt).not.toContain('<!-- id:');
    });

    it('includes new pinned memories and scratchpad items after compaction', async () => {
      const session = createSession({ sessionId: 's1', cwd: workspace });
      await session.start();
      await session.prompt('hello');
      await session.tool('memory', { ...saveOnMatch, delivery: 'pinned', scope: 'workspace' });
      await session.tool('scratchpad', { action: 'add', text: 'Migrate the auth tests' });

      await session.compact();
      const { systemPrompt } = await session.prompt('after compaction');

      expect(systemPrompt).toContain('### Pinned memories (this workspace)');
      expect(systemPrompt).toContain('JS/TS projects use pnpm.');
      expect(systemPrompt).toContain('- Migrate the auth tests');
    });
  });

  describe('search index', () => {
    it('keeps the shared index through a reload and releases it when the session ends', async () => {
      vi.mocked(releaseIndex).mockClear();
      const session = createSession({ sessionId: 's1', cwd: workspace });
      await session.start();
      await session.prompt('hello');

      await session.shutdown('reload');
      expect(releaseIndex).not.toHaveBeenCalled();

      await session.shutdown('quit');
      expect(releaseIndex).toHaveBeenCalledWith('s1');
    });
  });

  describe('recall', () => {
    async function sessionWithMemory(branch = [] as Array<{ type: string; customType?: string; details?: unknown }>) {
      const setup = createSession({ sessionId: 'setup', cwd: workspace });
      await setup.start();
      const saved = await setup.tool('memory', saveOnMatch);
      const id = /\[(mem-[a-z0-9-]+)/.exec(saved)![1]!;
      const session = createSession({ sessionId: 's1', cwd: workspace, branch: branch.map((entry) => ({
        ...entry,
        details: entry.details === 'ID' ? { ids: [id], scores: [0.9] } : entry.details,
      })) });
      await session.start();
      return { session, id };
    }

    it('adds nothing when no memory matches', async () => {
      const { session } = await sessionWithMemory();
      expect((await session.prompt('Write a haiku about the sea')).message).toBeUndefined();
    });

    it('recalls a memory that matches one saved term before the search model has loaded', async () => {
      const { session, id } = await sessionWithMemory();

      expect((await session.prompt('Which package manager should I use here?')).message?.content).toContain(id);
    });

    it('lists each recalled memory with its fact and behaviour for the chat line', async () => {
      const { session, id } = await sessionWithMemory();

      const { message } = await session.prompt('Which package manager should I use here?');

      expect((message?.details as { memories?: unknown }).memories).toEqual([{
        id,
        type: 'preference',
        fact: saveOnMatch.content,
        behaviour: saveOnMatch.behaviour,
      }]);
    });

    it('adds a matching memory after the message, once per session', async () => {
      const { session, id } = await sessionWithMemory();

      const first = await session.prompt('Add a dependency with the package manager');
      expect(first.message?.customType).toBe(RECALL_MESSAGE_TYPE);
      expect(first.message?.content).toContain(id);

      expect((await session.prompt('Add another dependency with the package manager')).message).toBeUndefined();
    });

    it('adds the memory again after compaction', async () => {
      const { session, id } = await sessionWithMemory();
      await session.prompt('Add a dependency with the package manager');

      await session.compact();

      expect((await session.prompt('Add a dependency with the package manager')).message?.content).toContain(id);
    });

    it('does not add a memory again in a resumed session that already recalled it', async () => {
      const { session } = await sessionWithMemory([
        { type: 'compaction' },
        { type: 'custom_message', customType: RECALL_MESSAGE_TYPE, details: 'ID' },
      ]);

      expect((await session.prompt('Add a dependency with the package manager')).message).toBeUndefined();
    });

    it('adds it in a resumed session when the earlier recall is before the latest compaction', async () => {
      const { session, id } = await sessionWithMemory([
        { type: 'custom_message', customType: RECALL_MESSAGE_TYPE, details: 'ID' },
        { type: 'compaction' },
      ]);

      expect((await session.prompt('Add a dependency with the package manager')).message?.content).toContain(id);
    });
  });
});
