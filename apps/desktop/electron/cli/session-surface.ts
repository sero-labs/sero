import type { EventBus } from '@earendil-works/pi-coding-agent';
import { SESSION_CLI_SURFACE_EVENT, type SessionCliSurface } from '@sero-ai/common';
import type { CliRegistry } from './core';

/**
 * Tell the session's extensions which Sero CLI commands it can run.
 *
 * A plugin that names one of its own commands in a prompt block checks this
 * list, because an allowlist can keep a plugin tool out of a session without
 * bridging its command. The registry already filters by session and
 * visibility, so this matches the command list the CLI prompt block shows.
 */
export function announceSessionCliSurface(
  events: EventBus,
  workspaceId: string,
  sessionId: string,
  registry: CliRegistry,
): void {
  const commands: string[] = [];
  for (const command of registry.list({ workspaceId, sessionId })) {
    if (!command.hidden) commands.push(command.name);
  }
  events.emit(SESSION_CLI_SURFACE_EVENT, { commands } satisfies SessionCliSurface);
}
