/**
 * `/orchestrator` slash command — a thin wrapper over the coordinator tool.
 *
 * Usage:
 *   /orchestrator list
 *   /orchestrator create <prompt...>
 *   /orchestrator show <loopId>
 *   /orchestrator activate|pause|resume|stop|run_next|delete <loopId>
 *   /orchestrator revise <loopId> [request...]
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { executeOrchestratorTool, ORCHESTRATOR_ACTIONS, type OrchestratorToolParamsShape } from './tools';

const HELP = `Usage:
  /orchestrator list
  /orchestrator create <prompt>
  /orchestrator show <loopId>
  /orchestrator activate|pause|resume|stop|run_next|delete <loopId>
  /orchestrator revise <loopId> [request]`;

export function parseCommand(args: string): OrchestratorToolParamsShape | { error: string } {
  const trimmed = args.trim();
  if (!trimmed) return { error: HELP };
  const [rawAction, ...rest] = trimmed.split(/\s+/);
  const action = rawAction as OrchestratorToolParamsShape['action'];
  if (!ORCHESTRATOR_ACTIONS.includes(action)) {
    return { error: `Unknown action "${rawAction}".\n${HELP}` };
  }
  const remainder = trimmed.slice(rawAction.length).trim();
  switch (action) {
    case 'list':
      return { action };
    case 'create':
      if (!remainder) return { error: 'create requires a prompt' };
      return { action, prompt: remainder };
    case 'revise': {
      const [loopId, ...promptParts] = rest;
      if (!loopId) return { error: 'revise requires a loopId' };
      return { action, loopId, prompt: promptParts.join(' ') || undefined };
    }
    default: {
      const loopId = rest[0];
      if (!loopId) return { error: `${action} requires a loopId` };
      return { action, loopId };
    }
  }
}

export function registerOrchestratorCommand(pi: ExtensionAPI): void {
  pi.registerCommand('orchestrator', {
    description: 'Manage Orchestrator loops: list, create, show, activate, pause, resume, stop, run_next, revise, delete',
    handler: async (args, ctx) => {
      const parsed = parseCommand(args ?? '');
      if ('error' in parsed) {
        ctx?.ui?.notify(parsed.error, 'error');
        return;
      }
      const res = await executeOrchestratorTool(parsed, ctx?.cwd);
      ctx?.ui?.notify(res.text, res.details.ok === false ? 'error' : 'info');
    },
  });
}
