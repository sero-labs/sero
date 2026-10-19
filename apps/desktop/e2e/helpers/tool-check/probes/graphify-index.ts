/**
 * `graphify_index`: queues a request that Graphify's background runtime
 * applies, so each step waits for the runtime to finish and then checks the
 * state file and the graph files it wrote.
 *
 * The first build installs Graphify for real: the runtime downloads `uv` from
 * the host toolchain, and `uv` fetches Python and `graphifyy` from PyPI. Nothing
 * is installed by hand, and no model or account is involved (code-only
 * extraction runs without credentials).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ScenarioStep, StepContext, ToolProbe } from '../types';
import { fileText, pageOf, putFile } from '../files';
import {
  ADDED_FUNCTION,
  FIRST_BUILD_WAIT_MS,
  expectQueued,
  graphifyDir,
  indexingIdle,
  plantSources,
  readGraphifyFile,
  readGraphifyState,
  waitForGraphify,
  workspaceOf,
  type GraphifyStateFile,
} from './graphify-support';

const BILLING = 'tc-graphify/billing.py';

/** Remembers values from the state file before a step, so the step can wait for them to change. */
async function remember(ctx: StepContext): Promise<void> {
  const state = await readGraphifyState(ctx);
  ctx.state.gfBuiltAt = workspaceOf(state, ctx)?.lastBuiltAt;
  ctx.state.gfMergedAt = state?.profileGraph?.mergedAt;
}

/** The workspace was built again and the profile graph merged again since `remember`. */
function rebuilt(ctx: StepContext) {
  return (state: GraphifyStateFile): boolean => {
    const entry = workspaceOf(state, ctx);
    return !!entry && entry.status === 'idle' && entry.lastBuiltAt !== ctx.state.gfBuiltAt
      && state.profileGraph?.status === 'ready' && state.profileGraph.mergedAt !== ctx.state.gfMergedAt;
  };
}

/** Both the workspace's graph and the merged profile graph hold `needle`. */
async function expectInGraphs(ctx: StepContext, needle: string): Promise<void> {
  for (const relative of [['graphs', ctx.workspaceId, 'graphify-out', 'graph.json'], ['profile', 'graph.json']]) {
    if (!(await readGraphifyFile(ctx, ...relative))?.includes(needle)) throw new Error(`${relative.join('/')} does not mention ${needle}`);
  }
}

/** Answers the confirmation Graphify raises before it installs a tool update. */
async function confirmUpdate(ctx: StepContext, version: string): Promise<void> {
  const page = pageOf(ctx);
  // Subscribe before reading the pending list, so a question raised in between is not missed.
  const question = await page.evaluate((timeoutMs) => new Promise<{ id: string; label: string }>((resolve, reject) => {
    const isUpdate = (entry: { id: string; questions: Array<{ label: string }> }) => entry.questions[0]?.label.startsWith('Update graphify to');
    const settle = (entry: { id: string; questions: Array<{ label: string }> }) => {
      clearTimeout(timer);
      stop();
      resolve({ id: entry.id, label: entry.questions[0]!.label });
    };
    const stop = window.sero.userFeedback.onQuestion((entry) => {
      if (isUpdate(entry)) settle(entry);
    });
    const timer = setTimeout(() => {
      stop();
      reject(new Error('Graphify never asked to confirm the update'));
    }, timeoutMs);
    void window.sero.userFeedback.getPending().then((pending) => {
      const found = pending.find(isUpdate);
      if (found) settle(found);
    });
  }), 60_000);
  if (question.label !== `Update graphify to ${version}?`) throw new Error(`asked "${question.label}", not about ${version}`);
  await page.evaluate((id) => window.sero.userFeedback.answer({
    id,
    cancelled: false,
    answers: [{ questionId: 'q0', value: 'confirm', label: 'Update graphify', wasCustom: false }],
  }), question.id);
}

/**
 * Makes sure an update is on offer. The runtime records one at start when
 * PyPI has a newer release; when it has not, offer the installed version
 * again, which the same path installs without a download.
 */
async function offerUpdate(ctx: StepContext): Promise<void> {
  const state = await waitForGraphify(ctx, 'indexing to settle', indexingIdle);
  let version = state.provisioning?.availableVersion;
  if (!version) {
    version = state.provisioning?.version;
    if (!version) throw new Error('Graphify has no installed version recorded');
    const file = path.join(await graphifyDir(ctx), 'state.json');
    const written = await pageOf(ctx).evaluate(async ({ target, offered }) => {
      const data = await window.sero.appState.read(target) as { provisioning?: Record<string, unknown> } | null;
      if (!data) return false;
      data.provisioning = { ...data.provisioning, availableVersion: offered };
      return (await window.sero.appState.write(target, data)).ok;
    }, { target: file, offered: version });
    if (!written) throw new Error('could not record an available update in the state file');
  }
  ctx.state.gfUpdateTo = version;
}

const steps: ScenarioStep[] = [
  {
    action: 'sync',
    setup: plantSources,
    params: { action: 'sync' },
    async expect(result, ctx) {
      expectQueued(result, 'sync');
      const state = await waitForGraphify(ctx, 'the workspace list to sync', (s) => !!workspaceOf(s, ctx));
      const known = await fs.realpath(workspaceOf(state, ctx)!.path);
      if (known !== (await fs.realpath(ctx.workspacePath))) throw new Error(`Graphify lists the workspace at ${known}`);
    },
  },
  {
    action: 'enable',
    params: (ctx) => ({ action: 'enable', workspace: ctx.workspaceId }),
    async expect(result, ctx) {
      expectQueued(result, `enable for ${ctx.workspaceId}`);
      const state = await waitForGraphify(ctx, 'the first build and the profile merge', (s) => {
        const entry = workspaceOf(s, ctx);
        return !!entry?.enabled && entry.status === 'idle' && !!entry.lastBuiltAt
          && s.profileGraph?.status === 'ready' && !!s.profileGraph.workspaceIds?.includes(ctx.workspaceId);
      }, FIRST_BUILD_WAIT_MS);
      const stats = workspaceOf(state, ctx)!.stats;
      if (!stats || stats.nodes < 6) throw new Error(`the graph has too few nodes: ${JSON.stringify(stats)}`);
      if (stats.inputTokens !== 0 || stats.outputTokens !== 0) throw new Error('a code-only build should use no model tokens');
      await expectInGraphs(ctx, 'compute_invoice_total');
      // The graph lives in the profile, not in the workspace.
      if (await fs.access(path.join(ctx.workspacePath, 'graphify-out')).then(() => true, () => false)) throw new Error('graphify-out was written into the workspace');
    },
  },
  {
    action: 'refresh',
    setup: async (ctx) => {
      await putFile(ctx, BILLING, `${(await fileText(ctx, BILLING)) ?? ''}\n\ndef ${ADDED_FUNCTION}(days):\n    return days * 2\n`);
      await remember(ctx);
    },
    params: (ctx) => ({ action: 'refresh', workspace: ctx.workspaceId }),
    async expect(result, ctx) {
      expectQueued(result, `refresh for ${ctx.workspaceId}`);
      await waitForGraphify(ctx, 'the update and the profile merge', rebuilt(ctx));
      await expectInGraphs(ctx, ADDED_FUNCTION);
    },
  },
  {
    action: 'rebuild',
    setup: remember,
    params: (ctx) => ({ action: 'rebuild', workspace: ctx.workspaceId }),
    async expect(result, ctx) {
      expectQueued(result, `rebuild for ${ctx.workspaceId}`);
      const state = await waitForGraphify(ctx, 'the clean rebuild and the profile merge', rebuilt(ctx));
      if (!workspaceOf(state, ctx)!.stats?.nodes) throw new Error('the rebuilt graph is empty');
      await expectInGraphs(ctx, ADDED_FUNCTION);
    },
  },
  {
    action: 'disable',
    params: (ctx) => ({ action: 'disable', workspace: ctx.workspaceId }),
    async expect(result, ctx) {
      expectQueued(result, `disable for ${ctx.workspaceId}`);
      await waitForGraphify(ctx, 'the workspace to leave the profile graph', (s) => {
        const profile = s.profileGraph;
        const gone = profile?.status === 'absent' || (profile?.status === 'ready' && !profile.workspaceIds?.includes(ctx.workspaceId));
        return workspaceOf(s, ctx)?.enabled === false && gone;
      });
    },
  },
  {
    action: 'enable-all',
    params: { action: 'enable-all' },
    async expect(result, ctx) {
      expectQueued(result, 'enable-all');
      // Its graph is still on disk, so this merges it back without building it again.
      await waitForGraphify(ctx, 'every workspace to be enabled and merged', (s) => {
        const entries = Object.values(s.workspaces ?? {});
        return entries.every((entry) => entry.enabled) && indexingIdle(s)
          && s.profileGraph?.status === 'ready' && !!s.profileGraph.workspaceIds?.includes(ctx.workspaceId);
      }, FIRST_BUILD_WAIT_MS);
    },
  },
  {
    action: 'upgrade',
    setup: offerUpdate,
    params: { action: 'upgrade' },
    async expect(result, ctx) {
      expectQueued(result, 'upgrade');
      const version = String(ctx.state.gfUpdateTo);
      await confirmUpdate(ctx, version);
      const state = await waitForGraphify(ctx, 'the update to install', (s) => {
        const provisioning = s.provisioning;
        return provisioning?.status === 'ready' && provisioning.version === version && !provisioning.availableVersion;
      }, FIRST_BUILD_WAIT_MS);
      if (state.provisioning?.version !== version) throw new Error(`Graphify is on ${String(state.provisioning?.version)}, not ${version}`);
    },
  },
];

export const graphifyIndexProbe: ToolProbe = { tool: 'graphify_index', steps };
