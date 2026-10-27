/**
 * What a session was given, read from its first request to the stub.
 */
import { cliCommandsListed } from '../session-probe';
import type { StubModelServer, StubRequest } from '../stub-model';
import { firstUserText } from './driver';

export interface SessionSurface {
  /** Direct tools, by name. */
  tools: string[];
  /** Commands listed in the Sero CLI block. */
  commands: string[];
}

/** The surface of the first request whose first user message is `prompt`, or that `prompt` matches. */
export function surfaceOf(server: StubModelServer, prompt: string | ((request: StubRequest) => boolean)): SessionSurface | undefined {
  const matches = typeof prompt === 'string' ? (request: StubRequest) => firstUserText(request) === prompt : prompt;
  const request = server.requests.find(matches);
  if (!request) return undefined;
  return { tools: request.tools.map((tool) => tool.name), commands: cliCommandsListed(request.system) };
}

/**
 * How a session reaches a tool: directly, through `sero-cli`, or not at all.
 * A core command is reached through `sero-cli` when the session has it.
 */
export function routeTo(surface: SessionSurface, tool: string): 'direct' | 'cli' | null {
  if (tool.startsWith('sero ')) {
    const command = tool.slice('sero '.length);
    // The `sero-cli` tool's own description tells every session to run `sero help`, so it is never listed.
    const given = command === 'help' || surface.commands.includes(command);
    return surface.tools.includes('sero-cli') && given ? 'cli' : null;
  }
  if (surface.tools.includes(tool)) return 'direct';
  if (surface.tools.includes('sero-cli') && surface.commands.includes(tool)) return 'cli';
  return null;
}

/** The tool names a site was given, in the inventory's naming: `sero <command>` for a core command. */
export function siteToolNames(surface: SessionSurface, coreCommands: ReadonlySet<string>): string[] {
  return [
    ...surface.tools,
    ...(surface.tools.includes('sero-cli') ? ['sero help'] : []),
    ...surface.commands.map((command) => (coreCommands.has(command) ? `sero ${command}` : command)),
  ];
}
