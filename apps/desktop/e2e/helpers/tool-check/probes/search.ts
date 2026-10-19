/**
 * `find`, `grep` and `multi_grep` (sero-fff-plugin) are direct tools. They
 * search an index of the workspace that follows file changes, so the fixture
 * files are written before a step and the first write is given a moment to
 * reach the index. The last tool removes the fixtures, so no later probe sees
 * untracked files in the workspace.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { expectError, expectText } from '../expect';
import { fileText, putFile } from '../files';
import type { StepContext, ToolCallResult, ToolProbe } from '../types';
import { must } from './cron-memory-support';

const FIXTURES: Record<string, string> = {
  'tc-fff/alpha.txt': 'first line\nTcFffNeedle alpha line\nlast line\n',
  'tc-fff/beta.md': '# Beta\nTC_FFF_NEEDLE beta variant\n',
  'tc-fff/gamma.txt': 'nothing to see here\n',
};

async function seedFixtures(ctx: StepContext): Promise<void> {
  let wrote = false;
  for (const [relative, content] of Object.entries(FIXTURES)) {
    if ((await fileText(ctx, relative)) === content) continue;
    await putFile(ctx, relative, content);
    wrote = true;
  }
  // The index watches the folder; a new file is searchable a moment later.
  // FFF exposes no ready signal for a file added after the first scan (waitForScan covers only that scan).
  if (wrote) await new Promise((resolve) => setTimeout(resolve, 2_500));
}

function removeFixtures(ctx: StepContext): Promise<void> {
  return fs.rm(path.join(ctx.workspacePath, 'tc-fff'), { recursive: true, force: true });
}

function lacks(result: ToolCallResult, ...fragments: string[]): void {
  for (const fragment of fragments) must(!result.text.includes(fragment), `result should not mention ${JSON.stringify(fragment)}: ${result.text}`);
}

export const findProbe: ToolProbe = {
  tool: 'find',
  steps: [
    {
      action: null,
      setup: seedFixtures,
      params: { pattern: 'alpha', path: 'tc-fff/' },
      expect(result) {
        expectText(result, 'tc-fff/alpha.txt');
        lacks(result, 'beta.md', 'gamma.txt');
      },
    },
    {
      // A constraint that leaves the workspace is refused (path-policy.ts PathOutsideWorkspaceError).
      action: null,
      params: { pattern: 'alpha', path: '../outside' },
      expect: (result) => expectError(result, 'is outside this session\'s workspace root'),
    },
  ],
};

export const grepProbe: ToolProbe = {
  tool: 'grep',
  steps: [
    {
      action: null,
      setup: seedFixtures,
      params: { pattern: 'TcFffNeedle' },
      expect(result) {
        // format.ts formatGrepOutput: the file path, then ` <line>: <text>`.
        expectText(result, 'tc-fff/alpha.txt');
        expectText(result, ' 2: TcFffNeedle alpha line');
        lacks(result, 'beta.md', 'gamma.txt');
      },
    },
    {
      // Context lines are drawn as ` <line>- <text>` around the match.
      action: null,
      params: { pattern: 'alpha', path: 'tc-fff/', context: 1 },
      expect(result) {
        expectText(result, ' 1- first line');
        expectText(result, ' 2: TcFffNeedle alpha line');
        expectText(result, ' 3- last line');
      },
    },
    {
      action: null,
      params: { pattern: 'alpha', path: '../outside' },
      expect: (result) => expectError(result, 'is outside this session\'s workspace root'),
    },
  ],
};

export const multiGrepProbe: ToolProbe = {
  tool: 'multi_grep',
  steps: [
    {
      action: null,
      setup: seedFixtures,
      params: { patterns: ['TcFffNeedle', 'TC_FFF_NEEDLE'], path: 'tc-fff/' },
      async expect(result, ctx) {
        try {
          expectText(result, 'tc-fff/alpha.txt');
          expectText(result, ' 2: TcFffNeedle alpha line');
          expectText(result, 'tc-fff/beta.md');
          expectText(result, ' 2: TC_FFF_NEEDLE beta variant');
          lacks(result, 'gamma.txt');
        } finally {
          await removeFixtures(ctx);
        }
      },
    },
    // Second: only the chat sees a result's error flag, and a site pass runs the first step everywhere.
    {
      action: null,
      params: { patterns: [] },
      expect: (result) => expectError(result, 'multi_grep needs at least one non-empty pattern.'),
    },
  ],
};
