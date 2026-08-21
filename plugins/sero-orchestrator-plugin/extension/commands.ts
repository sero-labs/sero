/**
 * `/orchestrator` slash command — a thin wrapper over the coordinator tool.
 *
 * Usage:
 *   /orchestrator list
 *   /orchestrator create <prompt...>
 *   /orchestrator show <loopId>
 *   /orchestrator activate|disable|enable|run_next|run_again|retry|reflect|delete <loopId>
 *   /orchestrator reflect_workspace
 *   /orchestrator extract_skill|discard_skill_draft <loopId>
 *   /orchestrator answer <loopId> <your answer...>
 *   /orchestrator revise <loopId> [request...]
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { Loop } from '../shared/types';
import { LOOP_DELIVERY_DESTINATION_IDS, isLoopDeliveryDestinationId } from '../shared/delivery-types';
import { executeOrchestratorTool, ORCHESTRATOR_ACTIONS, type OrchestratorToolParamsShape } from './tools';

const HELP = `Usage:
  /orchestrator list
  /orchestrator create [--deliver <destination>] <prompt>
  /orchestrator show <loopId>
  /orchestrator activate|disable|enable|run_next|run_again|retry|reflect|delete <loopId>
  /orchestrator retry_step <loopId> <stepId>
  /orchestrator set_delivery <loopId> <destination>
  /orchestrator set_schedule <loopId> <triggerId> <cron schedule (UTC)>
  /orchestrator reflect_workspace
  /orchestrator extract_skill <loopId>
  /orchestrator discard_skill_draft <loopId>
  /orchestrator answer <loopId> <your answer>
  /orchestrator revise <loopId> [request]
  /orchestrator library_list
  /orchestrator library_save <loopId> <new-version|new-entry> [note]
  /orchestrator library_load <entryId> [version]
  /orchestrator library_set_version <loopId> <version>
  /orchestrator library_unlink <loopId>
  /orchestrator library_delete <entryId>
  /orchestrator catalog_list
  /orchestrator catalog_refresh [repoKey]
  /orchestrator catalog_install <repoKey> <slug>
  /orchestrator catalog_add_repo <url>
  /orchestrator catalog_remove_repo <repoKey>`;

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
    case 'library_list':
    case 'catalog_list':
      return { action };
    case 'catalog_refresh':
      return { action, repoKey: rest[0] };
    case 'catalog_install': {
      const [repoKey, slug] = rest;
      if (!repoKey || !slug) return { error: 'catalog_install requires a repoKey and a slug (see catalog_list)' };
      return { action, repoKey, slug };
    }
    case 'catalog_add_repo': {
      const [url] = rest;
      if (!url) return { error: 'catalog_add_repo requires a git repo URL' };
      return { action, url };
    }
    case 'catalog_remove_repo': {
      const [repoKey] = rest;
      if (!repoKey) return { error: 'catalog_remove_repo requires a repoKey' };
      return { action, repoKey };
    }
    case 'create': {
      if (!remainder) return { error: 'create requires a prompt' };
      // Optional leading destination flag; the prompt is everything after it.
      const flagged = remainder.match(/^--deliver\s+(\S+)\s+([\s\S]+)$/);
      if (!flagged) return { action, prompt: remainder };
      if (!isLoopDeliveryDestinationId(flagged[1])) return { error: `Unknown destination "${flagged[1]}". Destinations: ${LOOP_DELIVERY_DESTINATION_IDS.join(', ')}` };
      return { action, prompt: flagged[2], deliveryDestination: flagged[1] };
    }
    case 'set_delivery': {
      const [loopId, destination] = rest;
      if (!loopId || !destination) return { error: 'set_delivery requires a loopId and a destination' };
      if (!isLoopDeliveryDestinationId(destination)) return { error: `Unknown destination "${destination}". Destinations: ${LOOP_DELIVERY_DESTINATION_IDS.join(', ')}` };
      return { action, loopId, deliveryDestination: destination };
    }
    case 'set_schedule': {
      const [loopId, triggerId, ...scheduleParts] = rest;
      const schedule = scheduleParts.join(' ').trim();
      if (!loopId || !triggerId || !schedule) {
        return { error: 'set_schedule requires a loopId, a triggerId, and a cron schedule: /orchestrator set_schedule <loopId> <triggerId> <min hour dom month dow>' };
      }
      return { action, loopId, triggerId, schedule };
    }
    case 'library_save': {
      const [loopId, mode, ...noteParts] = rest;
      if (!loopId) return { error: 'library_save requires a loopId' };
      if (mode !== 'new-version' && mode !== 'new-entry') return { error: 'library_save requires a mode: new-version | new-entry' };
      return { action, loopId, mode, note: noteParts.join(' ') || undefined };
    }
    case 'library_load': {
      const [entryId, versionStr] = rest;
      if (!entryId) return { error: 'library_load requires an entryId' };
      const version = versionStr ? Number(versionStr) : undefined;
      if (versionStr !== undefined && !Number.isInteger(version)) return { error: 'version must be a whole number' };
      return { action, entryId, version };
    }
    case 'library_set_version': {
      const [loopId, versionStr] = rest;
      const version = Number(versionStr);
      if (!loopId || !Number.isInteger(version)) return { error: 'library_set_version requires a loopId and a numeric version' };
      return { action, loopId, version };
    }
    case 'library_delete': {
      const [entryId] = rest;
      if (!entryId) return { error: 'library_delete requires an entryId' };
      return { action, entryId };
    }
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
    case 'save_skill':
      // A SKILL.md body cannot be typed as a command argument. Extract, then
      // review and save it in the Orchestrator app (or through the tool).
      return { error: 'save_skill is not available as a command — review and save the draft in the Orchestrator app.' };
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
    description: 'Manage Orchestrator loops: list, create, show, activate, disable, enable, run_next, run_again, retry, revise, reflect, reflect_workspace, extract_skill (draft a reusable skill from a proven workflow), save_skill, discard_skill_draft, answer, delete, the Loop Library (library_list/save/load/set_version/unlink/delete), and the Loop Catalog (catalog_list/refresh/install/add_repo/remove_repo)',
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
