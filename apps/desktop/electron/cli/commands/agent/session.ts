import { buildModelState } from '../../../ipc/agent/core/agent-helpers';
import { getCliSessionBridge } from '../../bridges/session-bridge';
import type { CliRegistry } from '../../core/registry';
import type { CliCommandContext } from '../../core/types';
import { fail, ok } from '../../lib/utils';

async function handleSession(args: string[], ctx: CliCommandContext) {
  const [action = 'info'] = args;
  if (action !== 'info') return fail('Usage: sero session info');

  const bridge = getCliSessionBridge();
  const sessionId = ctx.invocation.sessionId;
  const entry = sessionId
    ? bridge.getSessionEntry(sessionId)
    : bridge.getActiveSessionForWorkspace(ctx.workspaceId);

  if (!entry) {
    return ok(`Workspace: ${ctx.workspaceId}\nNo active agent session.`);
  }

  const stats = entry.session.getSessionStats();
  const modelState = buildModelState({ session: entry.session });
  const activeTurnId = bridge.getActiveTurnId(entry.sessionId);

  const lines = [
    `Workspace: ${entry.workspaceId}`,
    `Session ID: ${entry.sessionId}`,
    `Session name: ${entry.session.sessionName || '(untitled)'}`,
    `Model: ${modelState.model.provider}/${modelState.model.modelId}`,
    `Thinking: ${modelState.thinkingLevel}`,
    `Tokens: ${stats.tokens}`,
    `Cost: ${stats.cost}`,
    `Requests: ${stats.userMessages}`,
    `Streaming: ${entry.session.agent.state.isStreaming ? 'yes' : 'no'}`,
    `Active turn: ${activeTurnId ?? '(none)'}`,
  ];

  return ok(lines.join('\n'));
}

async function handleSetTitle(args: string[], ctx: CliCommandContext) {
  const title = args.join(' ').trim();
  if (!title) return fail('Usage: sero set-title <text>');
  const sessionId = ctx.invocation.sessionId;
  if (!sessionId) return fail('set-title requires an active agent session');

  try {
    getCliSessionBridge().setSessionTitle(sessionId, title);
    return ok(`Session titled: ${title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set title';
    return fail(message);
  }
}

export function registerSessionCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'session',
    summary: 'Session commands (info)',
    help: 'session — Agent session info\n\nUsage: sero session info\n',
    source: 'builtin',
    group: 'Builtin',
    execute: handleSession,
  });

  registry.register({
    name: 'set-title',
    summary: 'Set the current session title',
    help: 'set-title — Set session title\n\nUsage: sero set-title <text>\n',
    source: 'builtin',
    group: 'Builtin',
    execute: handleSetTitle,
  });
}
