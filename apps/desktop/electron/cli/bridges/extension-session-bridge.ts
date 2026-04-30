import type {
  Extension,
  RegisteredCommand,
  RegisteredTool,
} from '@mariozechner/pi-coding-agent';

import type { CliCommandContext } from '../core/types';
import { getCliSessionBridge } from './session-bridge';

interface BridgedExtensionSessionItems {
  tools: Map<string, RegisteredTool>;
  commands: Map<string, RegisteredCommand>;
}

const sessionItems = new Map<string, BridgedExtensionSessionItems>();

function resolveSessionId(
  context: Pick<CliCommandContext, 'workspaceId' | 'invocation'>,
): string | null {
  if (context.invocation.sessionId) return context.invocation.sessionId;

  try {
    return getCliSessionBridge().getActiveSessionForWorkspace(context.workspaceId)?.sessionId ?? null;
  } catch {
    return null;
  }
}

function resolveSessionEntry(
  context: Pick<CliCommandContext, 'workspaceId' | 'invocation'>,
) {
  const sessionId = resolveSessionId(context);
  if (!sessionId) return null;

  try {
    const entry = getCliSessionBridge().getSessionEntry(sessionId);
    return entry ? { sessionId, entry } : null;
  } catch {
    return null;
  }
}

export function replaceBridgedExtensionSessionItems(
  sessionId: string,
  extensions: Extension[],
): void {
  const tools = new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();

  for (const ext of extensions) {
    for (const [name, registered] of ext.tools) {
      tools.set(name, registered);
    }
    for (const [name, registered] of ext.commands) {
      commands.set(name, registered);
    }
  }

  sessionItems.set(sessionId, { tools, commands });
}

export function getBridgedExtensionTool(
  name: string,
  context: Pick<CliCommandContext, 'workspaceId' | 'invocation'>,
): RegisteredTool | undefined {
  const resolved = resolveSessionEntry(context);
  if (!resolved) return undefined;

  const liveTool = resolved.entry.session.extensionRunner?.getToolDefinition(name);
  if (liveTool) {
    return {
      definition: liveTool,
      extensionPath: sessionItems.get(resolved.sessionId)?.tools.get(name)?.extensionPath ?? '<session>',
    };
  }

  return sessionItems.get(resolved.sessionId)?.tools.get(name);
}

export function getBridgedExtensionCommand(
  name: string,
  context: CliCommandContext,
): RegisteredCommand | undefined {
  const resolved = resolveSessionEntry(context);
  if (!resolved) return undefined;

  const liveRunner = resolved.entry.session.extensionRunner;
  const liveCommand = liveRunner?.getCommand(name);
  if (liveCommand && liveRunner) {
    return {
      ...liveCommand,
      handler: (args, _ctx) => liveCommand.handler(args, {
        ...(context.agentContext ? { ...context.agentContext } : {}),
        ...liveRunner.createCommandContext(),
        sessionRuntime: context.sessionRuntime,
      } as Parameters<typeof liveCommand.handler>[1]),
    };
  }

  const registered = sessionItems.get(resolved.sessionId)?.commands.get(name);
  if (!registered) return undefined;

  if (!liveRunner) {
    // No live runner is available in some test/direct CLI contexts. Return the
    // session-scoped registration; bridgeCommand will still provide a
    // session-backed command context with sessionRuntime.
    return registered;
  }

  // Some bridged extension commands are removed from the live runner command
  // map, but their handlers are still valid if executed with the live runner's
  // context. Never call them with the load-time context captured during
  // extension discovery when a live runner is available; Pi action methods are
  // unavailable there.
  return {
    ...registered,
    handler: (args, _ctx) => registered.handler(args, {
      ...(context.agentContext ? { ...context.agentContext } : {}),
      ...liveRunner.createCommandContext(),
      sessionRuntime: context.sessionRuntime,
    } as Parameters<typeof registered.handler>[1]),
  };
}

export function clearBridgedExtensionSessionItemsForSession(sessionId: string): void {
  sessionItems.delete(sessionId);
}

export function clearBridgedExtensionSessionItems(): void {
  sessionItems.clear();
}
