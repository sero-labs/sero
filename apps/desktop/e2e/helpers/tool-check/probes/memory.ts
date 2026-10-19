import fs from 'node:fs/promises';
import path from 'node:path';
import { expectError, expectOk, expectText } from '../expect';
import { fileText } from '../files';
import type { StepContext, ToolProbe } from '../types';
import { expectContains, expectLacks, must, profileDir } from './cron-memory-support';

// Workspace-scope entries live in `<workspace>/.sero/apps/memory/entries/<delivery>/<id>.md`
// and trashed ones in `.../trash/<id>.md` (plugins/sero-memory-plugin/extension/entry-store.ts).
const MEMORY_DIR = '.sero/apps/memory';
const FACT_ONE = 'tc-memory fact: the tool check prefers tabs';
const FACT_TWO = 'tc-memory fact: the tool check prefers spaces';
const PROFILE_TEXT = 'tc-memory profile: the user likes plain English answers.';

const idOf = (ctx: StepContext): string => String(ctx.state.memoryId);
const entryPath = (ctx: StepContext, delivery: 'pinned' | 'on-match'): string => `${MEMORY_DIR}/entries/${delivery}/${idOf(ctx)}.md`;
const trashPath = (ctx: StepContext): string => `${MEMORY_DIR}/trash/${idOf(ctx)}.md`;

async function expectEntryIn(ctx: StepContext, where: 'pinned' | 'on-match' | 'trash'): Promise<string> {
  const places = { pinned: entryPath(ctx, 'pinned'), 'on-match': entryPath(ctx, 'on-match'), trash: trashPath(ctx) };
  for (const [name, relative] of Object.entries(places)) {
    const text = await fileText(ctx, relative);
    if (name === where) {
      must(text !== null, `${relative} is missing`);
      return text;
    }
    must(text === null, `${relative} should not exist`);
  }
  throw new Error('unreachable');
}

async function userFile(ctx: StepContext): Promise<string | null> {
  return fs.readFile(path.join(await profileDir(ctx), 'workspaces', 'global', 'USER.md'), 'utf8').catch(() => null);
}

let siteFacts = 0;

export const memoryProbe: ToolProbe = {
  tool: 'memory',
  // A call the schema accepts and the tool refuses.
  failingCall: { action: 'remove', id: 'mem-00000000' },
  // A fact close to one already saved is refused, so each site saves its own, marked distinct.
  siteStep: {
    action: 'save',
    params: (ctx) => {
      siteFacts += 1;
      ctx.state.siteFact = `tc-memory site fact ${siteFacts}: the ${ctx.site} site saves memories`;
      return {
        action: 'save', content: ctx.state.siteFact, behaviour: 'Check tc-memory site facts', type: 'preference',
        scope: 'workspace', delivery: 'on-match', terms: 'tc-memory-site', distinct: true,
      };
    },
    expect: (result, ctx) => expectText(result, `Saved: ${String(ctx.state.siteFact)} [`),
  },
  steps: [
    {
      action: 'save',
      params: {
        action: 'save', content: FACT_ONE, behaviour: 'Use tabs when editing tc-memory files', type: 'preference',
        scope: 'workspace', delivery: 'on-match', terms: 'tc-memory-alpha, tc-memory-tabs',
      },
      async expect(result, ctx) {
        // memory-entries.ts: `Saved: ${fact} [${id}, ${scope}, ${delivery}]`
        expectText(result, `Saved: ${FACT_ONE} [`);
        const id = /\[(mem-[a-z0-9]+), workspace, on-match\]/.exec(result.text)?.[1];
        must(id, `no entry id in: ${result.text}`);
        ctx.state.memoryId = id;
        const file = await expectEntryIn(ctx, 'on-match');
        must(file.includes(FACT_ONE) && file.includes('Behaviour: Use tabs when editing tc-memory files'), `entry file is wrong:\n${file}`);
        must(file.includes('terms: tc-memory-alpha, tc-memory-tabs') && file.includes('type: preference'), `entry file is wrong:\n${file}`);
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result, ctx) => expectContains(result, 'workspace on-match:', `- [${idOf(ctx)}] (workspace, on-match, preference) ${FACT_ONE}`),
    },
    {
      action: 'replace',
      params: (ctx) => ({
        action: 'replace', id: idOf(ctx), content: FACT_TWO, behaviour: 'Use spaces when editing tc-memory files', terms: 'tc-memory-alpha, tc-memory-spaces',
      }),
      async expect(result, ctx) {
        expectText(result, `Saved: ${FACT_TWO} [${idOf(ctx)}, replaced]`);
        const file = await expectEntryIn(ctx, 'on-match');
        must(file.includes(FACT_TWO) && file.includes('terms: tc-memory-alpha, tc-memory-spaces') && !file.includes('tabs'), `entry was not replaced:\n${file}`);
      },
    },
    {
      action: 'pin',
      params: (ctx) => ({ action: 'pin', id: idOf(ctx) }),
      async expect(result, ctx) {
        expectText(result, `Pinned: [${idOf(ctx)}] (workspace, pinned, preference) ${FACT_TWO}`);
        await expectEntryIn(ctx, 'pinned');
      },
    },
    {
      action: 'unpin',
      params: (ctx) => ({ action: 'unpin', id: idOf(ctx) }),
      async expect(result, ctx) {
        expectText(result, `Unpinned: [${idOf(ctx)}] (workspace, on-match, preference) ${FACT_TWO}`);
        await expectEntryIn(ctx, 'on-match');
      },
    },
    {
      action: 'remove',
      params: (ctx) => ({ action: 'remove', id: idOf(ctx), reason: 'tool check' }),
      async expect(result, ctx) {
        expectText(result, `Removed: ${FACT_TWO} [${idOf(ctx)}]. Restore it with`);
        const trashed = await expectEntryIn(ctx, 'trash');
        must(trashed.includes('evidence: removed by the agent: tool check'), `trash file does not record the reason:\n${trashed}`);
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result, ctx) => { expectOk(result); expectLacks(result, idOf(ctx)); },
    },
    {
      action: 'restore',
      params: (ctx) => ({ action: 'restore', id: idOf(ctx) }),
      async expect(result, ctx) {
        expectText(result, `Restored: [${idOf(ctx)}] (workspace, on-match, preference)`);
        await expectEntryIn(ctx, 'on-match');
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result, ctx) => expectContains(result, `- [${idOf(ctx)}] (workspace, on-match, preference) ${FACT_TWO}`),
    },
    {
      // An id that does not exist is refused.
      action: 'remove',
      params: { action: 'remove', id: 'mem-00000000' },
      expect: (result) => expectError(result, 'Error: no memory with id mem-00000000.'),
    },
    {
      // Leaves no live entry behind in the shared workspace.
      action: 'remove',
      params: (ctx) => ({ action: 'remove', id: idOf(ctx), reason: 'tool check cleanup' }),
      async expect(result, ctx) {
        expectText(result, `Removed: ${FACT_TWO} [${idOf(ctx)}]`);
        await expectEntryIn(ctx, 'trash');
      },
    },
    {
      action: 'write',
      params: { action: 'write', target: 'user', content: PROFILE_TEXT },
      async expect(result, ctx) {
        expectText(result, 'Wrote USER.md. The new profile is in the system prompt from the next session.');
        const file = await userFile(ctx);
        must(file?.startsWith('<!-- last updated: ') && file.includes(PROFILE_TEXT), `USER.md holds ${JSON.stringify(file)}`);
      },
    },
    {
      action: 'write',
      params: { action: 'write', content: 'tc-memory profile without a target' },
      async expect(result, ctx) {
        expectError(result, 'Error: target (identity|user) is required for write.');
        must(!(await userFile(ctx))?.includes('without a target'), 'a write with no target changed USER.md');
      },
    },
    {
      action: 'read',
      params: { action: 'read', target: 'user' },
      async expect(result, ctx) {
        expectText(result, PROFILE_TEXT);
        // USER.md starts with a `last updated` comment, which read strips.
        must((await userFile(ctx))?.includes('<!-- last updated: '), 'USER.md holds no metadata line to strip');
        expectLacks(result, '<!-- last updated');
      },
    },
  ],
};

const ITEM_ONE = 'tc-scratchpad first';
const SCRATCHPAD = `${MEMORY_DIR}/scratchpad.md`;

const itemNumber = (ctx: StepContext): number => Number(ctx.state.scratchpadItem);

/** The `- [ ] text` / `- [x] text` line the file must hold for the item. */
async function expectItemLine(ctx: StepContext, done: boolean): Promise<void> {
  const file = (await fileText(ctx, SCRATCHPAD)) ?? '';
  must(file.split('\n').includes(`- [${done ? 'x' : ' '}] ${ITEM_ONE}`), `scratchpad.md does not hold the item as ${done ? 'done' : 'open'}:\n${file}`);
}

export const scratchpadProbe: ToolProbe = {
  tool: 'scratchpad',
  steps: [
    {
      action: 'add',
      params: { action: 'add', text: ITEM_ONE },
      async expect(result, ctx) {
        // scratchpad.ts formatScratchpad: `Scratchpad (N open):\n1. [ ] text`
        expectText(result, 'Scratchpad (');
        const number = /^(\d+)\. \[ \] tc-scratchpad first$/m.exec(result.text)?.[1];
        must(number, `the item is not in the returned list: ${result.text}`);
        ctx.state.scratchpadItem = Number(number);
        await expectItemLine(ctx, false);
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result, ctx) => expectContains(result, `${itemNumber(ctx)}. [ ] ${ITEM_ONE}`),
    },
    {
      action: 'done',
      params: (ctx) => ({ action: 'done', item: itemNumber(ctx) }),
      async expect(result, ctx) {
        expectText(result, `${itemNumber(ctx)}. [x] ${ITEM_ONE}`);
        await expectItemLine(ctx, true);
      },
    },
    {
      action: 'undo',
      params: (ctx) => ({ action: 'undo', item: itemNumber(ctx) }),
      async expect(result, ctx) {
        expectText(result, `${itemNumber(ctx)}. [ ] ${ITEM_ONE}`);
        await expectItemLine(ctx, false);
      },
    },
    {
      action: 'done',
      params: { action: 'done', item: 9999 },
      expect: (result) => expectError(result, 'Error: item must be a number from 1 to'),
    },
    {
      // Leaves the item done, so the shared workspace has no open item.
      action: 'done',
      params: (ctx) => ({ action: 'done', item: itemNumber(ctx) }),
      async expect(result, ctx) {
        expectText(result, `${itemNumber(ctx)}. [x] ${ITEM_ONE}`);
        await expectItemLine(ctx, true);
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result, ctx) => expectContains(result, `${itemNumber(ctx)}. [x] ${ITEM_ONE}`),
    },
  ],
};
