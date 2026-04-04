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
  const sessionId = resolveSessionId(context);
  if (!sessionId) return undefined;
  return sessionItems.get(sessionId)?.tools.get(name);
}

export function getBridgedExtensionCommand(
  name: string,
  context: Pick<CliCommandContext, 'workspaceId' | 'invocation'>,
): RegisteredCommand | undefined {
  const sessionId = resolveSessionId(context);
  if (!sessionId) return undefined;
  return sessionItems.get(sessionId)?.commands.get(name);
}

export function clearBridgedExtensionSessionItemsForSession(sessionId: string): void {
  sessionItems.delete(sessionId);
}

export function clearBridgedExtensionSessionItems(): void {
  sessionItems.clear();
}
