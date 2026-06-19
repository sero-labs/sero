/**
 * Push-based graph freshness — no polling.
 *
 * The pi SDK already tells us when the agent changes files: every mutating
 * tool call surfaces as `tool_execution_end`. We mark the session dirty and,
 * at `agent_end`, queue ONE incremental `refresh` request for the current
 * workspace (only if the user opted it into indexing). The background runtime
 * drains the request, runs the AST-only `graphify update`, and re-merges.
 *
 * `session_start` doubles as workspace discovery: a session opening in a
 * workspace graphify has never seen means the profile list is stale, so we
 * queue a `sync` request instead of polling for new workspaces.
 *
 * Both writes are best-effort: container sessions may mount the profile home
 * read-only, in which case the panel-mount sync and boot catch-up cover it.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { GraphifyPaths } from '../shared/paths';
import { appendIndexRequest, readStateFile } from '../shared/state-io';
import { resolveCurrentWorkspace } from './current-workspace';

/** Tools that can change workspace files. Bash is opaque (we cannot know what
 * a command touched), so it counts as potentially mutating — a no-op update
 * costs nothing. */
const MUTATING_TOOLS = new Set(['edit', 'write', 'bash']);

export function registerRefreshOnEdit(pi: ExtensionAPI, paths: GraphifyPaths): void {
  let dirty = false;

  pi.on('session_start', async (_event: unknown, ctx: { cwd: string }) => {
    try {
      const state = await readStateFile(paths.stateFile);
      if (!state || !resolveCurrentWorkspace(state, ctx.cwd)) {
        await appendIndexRequest(paths.stateFile, 'sync');
      }
    } catch {
      // Read-only profile mount (container isolation) — discovery falls back
      // to the panel-mount sync and the runtime's boot pass.
    }
  });

  pi.on('tool_execution_end', async (event: unknown) => {
    const { toolName, isError } = event as { toolName?: string; isError?: boolean };
    if (!isError && toolName && MUTATING_TOOLS.has(toolName)) dirty = true;
  });

  pi.on('agent_end', async (_event: unknown, ctx: { cwd: string }) => {
    if (!dirty) return;
    dirty = false;
    try {
      const state = await readStateFile(paths.stateFile);
      const entry = state ? resolveCurrentWorkspace(state, ctx.cwd) : null;
      if (entry?.enabled) await appendIndexRequest(paths.stateFile, 'refresh', entry.workspaceId);
    } catch {
      // Read-only profile mount — the boot catch-up absorbs these edits.
    }
  });
}
