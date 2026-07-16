import { buildModelState } from '@electron/ipc/agent/core/agent-helpers';
import { getCliSessionBridge } from '@electron/cli/bridges/session-bridge';
import type { CliRegistry } from '@electron/cli/core/registry';
import type { CliCommandContext } from '@electron/cli/core/types';
import { fail, ok } from '@electron/cli/lib/utils';

const MAX_SESSION_TITLE_LENGTH = 48;

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
  const ifUnnamed = args.includes('--if-unnamed');
  const rawTitle = args.filter((arg) => arg !== '--if-unnamed').join(' ').trim();
  if (!rawTitle) return fail('Usage: sero set-title [--if-unnamed] <text>');
  // Truncate rather than reject: an over-length title is hidden from the chat,
  // so failing here would leave the session silently untitled.
  const title =
    rawTitle.length > MAX_SESSION_TITLE_LENGTH
      ? rawTitle.slice(0, MAX_SESSION_TITLE_LENGTH).trimEnd()
      : rawTitle;

  const sessionId = ctx.invocation.sessionId;
  if (!sessionId) return fail('set-title requires an active agent session');

  try {
    const bridge = getCliSessionBridge();
    if (ifUnnamed && bridge.getSessionEntry(sessionId)?.session.sessionName) {
      return ok('Session already has a title');
    }

    bridge.setSessionTitle(sessionId, title);
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
    summary: 'Set a short session title',
    help: 'set-title — Set a short session title (maximum 48 characters)\n\nUsage: sero set-title [--if-unnamed] <text>\n',
    source: 'builtin',
    group: 'Builtin',
    execute: handleSetTitle,
  });
}
