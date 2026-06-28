/**
 * `/orchestrator` slash command — a thin wrapper over the coordinator tool.
 *
 * Usage:
 *   /orchestrator list
 *   /orchestrator create <prompt...>
 *   /orchestrator show <loopId>
 *   /orchestrator activate|disable|enable|run_next|run_again|retry|reflect|delete <loopId>
 *   /orchestrator reflect_workspace
 *   /orchestrator answer <loopId> <your answer...>
 *   /orchestrator revise <loopId> [request...]
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { Loop } from '../shared/types';
import { executeOrchestratorTool, ORCHESTRATOR_ACTIONS, type OrchestratorToolParamsShape } from './tools';

const HELP = `Usage:
  /orchestrator list
  /orchestrator create <prompt>
  /orchestrator show <loopId>
  /orchestrator activate|disable|enable|run_next|run_again|retry|reflect|delete <loopId>
  /orchestrator retry_step <loopId> <stepId>
  /orchestrator reflect_workspace
  /orchestrator answer <loopId> <your answer>
  /orchestrator revise <loopId> [request]`;

/** Parsed command: either tool params, an answer request (resolved separately), or an error. */
export type ParsedCommand =
  | OrchestratorToolParamsShape
  | { answer: { loopId: string; text: string } }
  | { error: string };

export function parseCommand(args: string): ParsedCommand {
  const trimmed = args.trim();
  if (!trimmed) return { error: HELP };
  const [rawAction, ...rest] = trimmed.split(/\s+/);
  if (rawAction === 'answer') {
    const [loopId, ...textParts] = rest;
    const text = textParts.join(' ').trim();
    if (!loopId || !text) return { error: 'answer requires a loopId and your answer: /orchestrator answer <loopId> <answer>' };
    return { answer: { loopId, text } };
  }
  const action = rawAction as OrchestratorToolParamsShape['action'];
  if (!ORCHESTRATOR_ACTIONS.includes(action)) {
    return { error: `Unknown action "${rawAction}".\n${HELP}` };
  }
  const remainder = trimmed.slice(rawAction.length).trim();
  switch (action) {
    case 'list':
    case 'reflect_workspace':
      return { action };
    case 'create':
      if (!remainder) return { error: 'create requires a prompt' };
      return { action, prompt: remainder };
    case 'revise': {
      const [loopId, ...promptParts] = rest;
      if (!loopId) return { error: 'revise requires a loopId' };
      return { action, loopId, prompt: promptParts.join(' ') || undefined };
    }
    case 'retry_step': {
      const [loopId, stepId] = rest;
      if (!loopId || !stepId) return { error: 'retry_step requires a loopId and a stepId' };
      return { action, loopId, stepId };
    }
    default: {
      const loopId = rest[0];
      if (!loopId) return { error: `${action} requires a loopId` };
      return { action, loopId };
    }
  }
}

/**
 * Answers a loop's pending question from a single free-text reply: looks up the
 * loop's `pendingInput`, applies the text to every open question, and submits.
 * (The panel offers the richer per-question / choice answer flow.)
 */
async function answerViaText(cwd: string | undefined, loopId: string, text: string): Promise<{ text: string; ok: boolean }> {
  const shown = await executeOrchestratorTool({ action: 'show', loopId }, cwd);
  const loop = (shown.details as { loop?: Loop }).loop;
  const pending = loop?.runtime.pendingInput;
  if (!pending) return { text: `Loop ${loopId} has no question waiting for an answer.`, ok: false };
  const answersJson = JSON.stringify(pending.questions.map((q) => ({ questionId: q.id, text })));
  const res = await executeOrchestratorTool({ action: 'answer_input', loopId, requestId: pending.id, answersJson }, cwd);
  return { text: res.text, ok: res.details.ok !== false };
}

export function registerOrchestratorCommand(pi: ExtensionAPI): void {
  pi.registerCommand('orchestrator', {
    description: 'Manage Orchestrator loops: list, create, show, activate, disable, enable, run_next, run_again, retry, revise, reflect, reflect_workspace, answer, delete',
    handler: async (args, ctx) => {
      const parsed = parseCommand(args ?? '');
      if ('error' in parsed) {
        ctx?.ui?.notify(parsed.error, 'error');
        return;
      }
      if ('answer' in parsed) {
        const res = await answerViaText(ctx?.cwd, parsed.answer.loopId, parsed.answer.text);
        ctx?.ui?.notify(res.text, res.ok ? 'info' : 'error');
        return;
      }
      const res = await executeOrchestratorTool(parsed, ctx?.cwd);
      ctx?.ui?.notify(res.text, res.details.ok === false ? 'error' : 'info');
    },
  });
}
