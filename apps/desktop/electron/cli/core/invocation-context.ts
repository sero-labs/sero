import type { ToolDefinition, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type {
  BridgedAgentContext,
  CliCommandContext,
  CliCommandUpdate,
  CliInvocation,
  CliSessionRuntime,
} from './types';
import { getCliSessionBridge } from '../bridges/session-bridge';
import { prepareCliImageContent } from './content-images';

export function buildInvocation(
  workspaceId: string,
  sessionId: string,
  signal?: AbortSignal,
): CliInvocation {
  const bridge = getCliSessionBridge();
  return {
    workspaceId,
    sessionId,
    turnId: bridge.getActiveTurnId(sessionId),
    source: 'tool',
    signal,
  };
}

export function buildSessionRuntime(
  context: Pick<CliCommandContext, 'workspaceId' | 'invocation'>,
): CliSessionRuntime | undefined {
  let bridge: ReturnType<typeof getCliSessionBridge>;
  try {
    bridge = getCliSessionBridge();
  } catch {
    return undefined;
  }

  const entry = context.invocation.sessionId
    ? bridge.getSessionEntry(context.invocation.sessionId)
    : bridge.getActiveSessionForWorkspace(context.workspaceId);
  if (!entry || entry.workspaceId !== context.workspaceId) return undefined;

  return {
    sessionId: entry.sessionId,
    sendUserMessage: (content, options) => entry.session.sendUserMessage(content, options),
    sendMessage: (message, options) => entry.session.sendCustomMessage(message, options),
  };
}

export function bridgeToolUpdate(
  onUpdate: Parameters<ToolDefinition['execute']>[3] | undefined,
): ((update: CliCommandUpdate) => void) | undefined {
  if (!onUpdate) return undefined;

  return (update) => {
    onUpdate({
      content: prepareCliImageContent(update.content) ?? [],
      details: update.details,
    });
  };
}

/**
 * Extract the agent context fields from an ExtensionContext, excluding `cwd`
 * (which the CLI provides separately). Method references are wrapped in
 * closures to preserve `this` binding from the original context.
 */
export function extractAgentContext(ctx: ExtensionContext): BridgedAgentContext {
  return {
    ui: ctx.ui,
    mode: ctx.mode,
    hasUI: ctx.hasUI,
    sessionManager: ctx.sessionManager,
    modelRegistry: ctx.modelRegistry,
    model: ctx.model,
    isProjectTrusted: () => ctx.isProjectTrusted(),
    isIdle: () => ctx.isIdle(),
    signal: ctx.signal,
    abort: () => ctx.abort(),
    hasPendingMessages: () => ctx.hasPendingMessages(),
    shutdown: () => ctx.shutdown(),
    getContextUsage: () => ctx.getContextUsage(),
    compact: (options) => ctx.compact(options),
    getSystemPrompt: () => ctx.getSystemPrompt(),
  };
}
