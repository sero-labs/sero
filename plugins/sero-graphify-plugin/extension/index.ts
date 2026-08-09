/**
 * Graphify extension — knowledge-graph search tools for agent sessions.
 *
 * Queries run against sero-managed graph artifacts under
 * SERO_HOME/apps/graphify/ via the pure TypeScript engine — no Python at
 * query time, so everything works identically in container sessions
 * (read-only access to the graphs dir is sufficient).
 */

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { resolveGraphifyPaths, workspaceGraphJson } from '../shared/paths';
import { readStateFile, appendIndexRequest, appendIndexRequests } from '../shared/state-io';
import { loadGraphResult, queryGraph, searchGraph, findPath, explainNode, type GraphLoadFailure } from '../shared/query-engine';
import { resolveCurrentWorkspace } from './current-workspace';
import { registerAutoContext } from './auto-context';
import { registerRefreshOnEdit } from './refresh-on-edit';

type ToolResult = {
  content: { type: 'text'; text: string }[];
  details: Record<string, unknown>;
};

function text(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], details: {} };
}

const NOT_BUILT = 'Profile graph not built yet. Enable workspace indexing in the Graphify panel or run: graphify_index enable-all';

/** Turn a load failure into a message that names the real problem, not a generic "not built". */
function unavailableMessage(failure: GraphLoadFailure, detail?: string): string {
  switch (failure) {
    case 'too-large':
      return `Profile graph is built but too large to load (${detail}). Disable or remove some workspaces in the Graphify panel to shrink it.`;
    case 'invalid':
      return `Profile graph could not be read (${detail}). Rebuild it from the Graphify panel.`;
    case 'absent':
      return NOT_BUILT;
  }
}

export default function graphifyExtension(pi: ExtensionAPI): void {
  const paths = resolveGraphifyPaths();

  pi.registerTool({
    name: 'graphify_search',
    label: 'Graphify Search',
    description: 'Search the profile-wide knowledge graph spanning ALL indexed workspaces. Use for cross-project questions, architecture overviews, and finding which workspace owns a concept.',
    parameters: Type.Object({
      question: Type.String({ description: 'Natural-language question or concept keywords' }),
      mode: Type.Optional(StringEnum(['bfs', 'dfs'] as const, { description: 'bfs = broad context (default), dfs = trace a specific chain' })),
      budget: Type.Optional(Type.Number({ description: 'Max answer tokens (default 1200)' })),
    }),
    async execute(_toolCallId, params) {
      const result = await loadGraphResult(paths.profileGraph);
      if (!('graph' in result)) return text(unavailableMessage(result.failure, result.detail));
      const { text: answer, files } = searchGraph(result.graph, params.question, { mode: params.mode, budget: params.budget });
      // `files` rides on `details` (UI-only) so the search panel can open them;
      // the agent still sees the identical text in `content`.
      return { content: [{ type: 'text', text: answer }], details: { files } };
    },
  });

  pi.registerTool({
    name: 'graphify_query',
    label: 'Graphify Query',
    description: 'Query the knowledge graph of the CURRENT workspace (falls back to the profile graph when the workspace is not indexed).',
    parameters: Type.Object({
      question: Type.String({ description: 'Natural-language question or concept keywords' }),
      mode: Type.Optional(StringEnum(['bfs', 'dfs'] as const)),
      budget: Type.Optional(Type.Number()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = await readStateFile(paths.stateFile);
      const entry = state && ctx ? resolveCurrentWorkspace(state, ctx.cwd) : null;
      const graphPath = entry ? workspaceGraphJson(paths, entry.workspaceId) : paths.profileGraph;
      const primary = await loadGraphResult(graphPath);
      if ('graph' in primary) return text(queryGraph(primary.graph, params.question, { mode: params.mode, budget: params.budget }));
      // Fall back to the profile graph only when the workspace simply has no graph
      // of its own. A built-but-unreadable workspace graph (too-large/invalid)
      // reports its real reason instead of a misleading "not built yet".
      if (primary.failure !== 'absent' || graphPath === paths.profileGraph) {
        return text(unavailableMessage(primary.failure, primary.detail));
      }
      const fallback = await loadGraphResult(paths.profileGraph);
      if ('graph' in fallback) return text(queryGraph(fallback.graph, params.question, { mode: params.mode, budget: params.budget }));
      return text(unavailableMessage(fallback.failure, fallback.detail));
    },
  });

  pi.registerTool({
    name: 'graphify_path',
    label: 'Graphify Path',
    description: 'Find the shortest connection between two concepts in the profile knowledge graph.',
    parameters: Type.Object({
      from: Type.String({ description: 'Source concept name or node id' }),
      to: Type.String({ description: 'Target concept name or node id' }),
    }),
    async execute(_toolCallId, params) {
      const result = await loadGraphResult(paths.profileGraph);
      if (!('graph' in result)) return text(unavailableMessage(result.failure, result.detail));
      return text(findPath(result.graph, params.from, params.to));
    },
  });

  pi.registerTool({
    name: 'graphify_explain',
    label: 'Graphify Explain',
    description: 'Plain-language explanation of a single concept/node: everything connected to it.',
    parameters: Type.Object({
      concept: Type.String({ description: 'Concept name or node id to explain' }),
    }),
    async execute(_toolCallId, params) {
      const result = await loadGraphResult(paths.profileGraph);
      if (!('graph' in result)) return text(unavailableMessage(result.failure, result.detail));
      return text(explainNode(result.graph, params.concept));
    },
  });

  pi.registerTool({
    name: 'graphify_status',
    label: 'Graphify Status',
    description: 'Show graphify index status for all workspaces in the profile.',
    parameters: Type.Object({}),
    async execute() {
      const state = await readStateFile(paths.stateFile);
      if (!state) return text('Graphify has no state yet — open the Graphify panel to get started.');
      const lines = [`Provisioning: ${state.provisioning.status}${state.provisioning.error ? ` (${state.provisioning.error})` : ''}`];
      lines.push(`Profile graph: ${state.profileGraph.status}${state.profileGraph.nodes ? ` — ${state.profileGraph.nodes} nodes / ${state.profileGraph.edges} edges` : ''}`);
      for (const entry of Object.values(state.workspaces)) {
        const stats = entry.stats ? ` ${entry.stats.nodes}n/${entry.stats.edges}e` : '';
        lines.push(`• ${entry.name} [${entry.enabled ? entry.status : 'disabled'}]${stats}${entry.lastError ? ` — ${entry.lastError}` : ''}`);
      }
      return text(lines.join('\n'));
    },
  });

  pi.registerTool({
    name: 'graphify_index',
    label: 'Graphify Index',
    description: 'Manage workspace indexing: enable, disable, rebuild, refresh a workspace, enable-all, or sync the workspace list. Builds run in the background; check progress with graphify_status.',
    parameters: Type.Object({
      action: StringEnum(['enable', 'disable', 'rebuild', 'refresh', 'enable-all', 'sync'] as const),
      workspace: Type.Optional(Type.String({ description: 'Workspace id or name (omit for enable-all/sync, or to target the current workspace)' })),
      workspaceId: Type.Optional(Type.String({ description: 'Exact workspace id supplied by a host contribution' })),
      workspaceName: Type.Optional(Type.String({ description: 'Workspace name supplied by a host contribution' })),
      workspacePath: Type.Optional(Type.String({ description: 'Workspace path supplied by a host contribution' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const state = await readStateFile(paths.stateFile);
        let workspaceId: string | undefined;
        if (params.action !== 'enable-all' && params.action !== 'sync') {
          const entries = Object.values(state?.workspaces ?? {});
          const entry = params.workspaceId
            ? entries.find((candidate) => candidate.workspaceId === params.workspaceId)
            : params.workspace
            ? entries.find((e) => e.workspaceId === params.workspace || e.name === params.workspace)
            : state && ctx ? resolveCurrentWorkspace(state, ctx.cwd) : null;
          if (!entry) {
            // A workspace-creation contribution runs immediately after the host
            // creates the workspace. Queue sync first so the following enable
            // request can target its new registry entry.
            if (
              params.action === 'enable'
              && params.workspaceId
              && params.workspaceName
              && params.workspacePath
            ) {
              const [syncId, enableId] = await appendIndexRequests(paths.stateFile, [
                { action: 'sync' },
                {
                  action: 'enable',
                  workspaceId: params.workspaceId,
                  workspaceName: params.workspaceName,
                  workspacePath: params.workspacePath,
                },
              ]);
              return text(`Queued workspace sync (request #${syncId}) and enable for ${params.workspaceId} (request #${enableId}). Track with graphify_status.`);
            }
            return text(`Error: Could not resolve workspace${params.workspace ? ` "${params.workspace}"` : ' from cwd'}. Known: ${entries.map((e) => e.workspaceId).join(', ') || '(none — runtime not started yet)'}`);
          }
          workspaceId = entry.workspaceId;
        }
        const id = await appendIndexRequest(paths.stateFile, params.action, workspaceId);
        return text(`Queued ${params.action}${workspaceId ? ` for ${workspaceId}` : ''} (request #${id}). Track with graphify_status.`);
      } catch (error) {
        // Container sessions may have the profile home mounted read-only.
        return text(`Error: Could not queue the request (state file not writable from this session): ${error instanceof Error ? error.message : String(error)}. Use the Graphify panel instead.`);
      }
    },
  });

  registerAutoContext(pi, paths);
  registerRefreshOnEdit(pi, paths);
}
