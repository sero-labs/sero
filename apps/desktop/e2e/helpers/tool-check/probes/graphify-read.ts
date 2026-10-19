/**
 * The Graphify tools that read the graph the `graphify_index` probe built, and
 * the settings tool. Searches look for names planted in `tc-graphify/`.
 */
import type { ScenarioStep, ToolProbe } from '../types';
import {
  expectAnswer,
  requireBuiltGraph,
  readGraphifyState,
  waitForGraphify,
  workspaceOf,
} from './graphify-support';

/** The first step of each reading probe checks the graph is there, so a missing one is explained. */
const needsGraph: Pick<ScenarioStep, 'setup'> = { setup: requireBuiltGraph };

export const graphifySearchProbe: ToolProbe = {
  tool: 'graphify_search',
  steps: [
    {
      action: null,
      ...needsGraph,
      params: { question: 'compute_invoice_total discount rule' },
      // The profile graph answers with the planted function and the one it calls.
      expect: (result) => expectAnswer(result, 'Traversal: BFS', 'compute_invoice_total', 'apply_discount_rule'),
    },
  ],
};

export const graphifyQueryProbe: ToolProbe = {
  tool: 'graphify_query',
  steps: [
    {
      action: null,
      ...needsGraph,
      params: { question: 'ledger archive entry', mode: 'dfs' },
      // The session's workspace has its own graph; the class and its method come from it.
      expect: (result) => expectAnswer(result, 'Traversal: DFS', 'LedgerArchiver', 'archive_entry'),
    },
  ],
};

export const graphifyPathProbe: ToolProbe = {
  tool: 'graphify_path',
  steps: [
    {
      action: null,
      ...needsGraph,
      params: { from: 'render_quarter_report', to: 'apply_discount_rule' },
      // Graphify walks edges both ways, so the route between the two ends is its own choice.
      expect: (result) => expectAnswer(result, 'Shortest path (', 'render_quarter_report', 'apply_discount_rule'),
    },
  ],
};

export const graphifyExplainProbe: ToolProbe = {
  tool: 'graphify_explain',
  steps: [
    {
      action: null,
      ...needsGraph,
      params: { concept: 'LedgerArchiver' },
      // The class is called by the report function and owns the archive method.
      expect: (result) => expectAnswer(result, 'Node: LedgerArchiver', 'archive_entry', 'render_quarter_report'),
    },
  ],
};

export const graphifyStatusProbe: ToolProbe = {
  tool: 'graphify_status',
  // It takes no parameters, so no call to it can fail.
  failingCall: null,
  steps: [
    {
      action: null,
      ...needsGraph,
      params: {},
      async expect(result, ctx) {
        const state = await readGraphifyState(ctx);
        const entry = workspaceOf(state, ctx);
        if (!entry?.stats) throw new Error('the state file has no stats for the workspace');
        // Read from the same state file the tool reads, so the numbers must match it.
        expectAnswer(
          result,
          'Provisioning: ready',
          `Profile graph: ready — ${state!.profileGraph!.nodes} nodes`,
          `• ${entry.name} [idle] ${entry.stats.nodes}n/${entry.stats.edges}e`,
        );
      },
    },
  ],
};

const DEFAULT_EXCLUDES = ['node_modules', 'dist', 'build', 'out', '.git', '*.lock', '*.min.js', '*.map'];

export const graphifyConfigureProbe: ToolProbe = {
  tool: 'graphify_configure',
  // Every parameter is optional, so the failing call gives one the wrong type. Pi wraps a lone string in a list, so not `exclude`.
  failingCall: { paused: 'tc-not-a-boolean' },
  steps: [
    {
      action: null,
      params: { paused: true },
      async expect(result, ctx) {
        expectAnswer(result, 'Queued settings change (request #');
        const state = await waitForGraphify(ctx, 'indexing to pause', (s) => s.settings?.paused === true);
        if (state.settings?.paused !== true) throw new Error('indexing is not paused');
      },
    },
    {
      action: null,
      params: { paused: false, exclude: [...DEFAULT_EXCLUDES, 'tc-graphify-skip'], clearNotice: true },
      async expect(result, ctx) {
        expectAnswer(result, 'Queued settings change (request #');
        const state = await waitForGraphify(ctx, 'the new settings', (s) => s.settings?.paused === false && !!s.settings.exclude?.includes('tc-graphify-skip'));
        if (state.notice !== null && state.notice !== undefined) throw new Error('the notice was not cleared');
        if (JSON.stringify(state.settings?.exclude) !== JSON.stringify([...DEFAULT_EXCLUDES, 'tc-graphify-skip'])) throw new Error('the exclude list differs from what was sent');
      },
    },
  ],
};
