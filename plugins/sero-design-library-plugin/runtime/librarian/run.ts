import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';

import type { LibrarianAnalysis } from '../../shared/librarian';
import type { DesignLibraryPaths } from '../../shared/paths';
import type { ItemRecord } from '../../shared/records';
import type { ModelSelection } from '../../shared/settings';
import { modelSelectionIsEmpty } from '../../shared/settings';
import { createReferenceImageTool } from './image-tool';
import { buildAnalysisTask, buildRepairMessage, buildSystemPrompt } from './prompt';
import { parseAnalysis, toLibrarianAnalysis, validateAnalysis } from './parse';

/**
 * One Librarian run.
 *
 * The session gets `platformTools: 'none'` and exactly one custom tool: the
 * one that returns the reference image. It has no bash, no read, no write and
 * no filesystem — a reference cannot cause anything to happen, and the image
 * reaches the model without depending on where the workspace happens to run.
 */

const REPAIR_ATTEMPTS = 2;
const RUN_TIMEOUT_MS = 180_000;

export interface LibrarianRunContext {
  host: AppRuntimeHost;
  paths: DesignLibraryPaths;
  workspaceId: string;
  parentSessionId: string;
  model: ModelSelection;
  signal: AbortSignal;
}

export type LibrarianRunOutcome =
  | { status: 'ok'; analysis: LibrarianAnalysis }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

export async function runLibrarian(
  item: ItemRecord,
  context: LibrarianRunContext,
): Promise<LibrarianRunOutcome> {
  const startedAt = Date.now();
  const imageTool = createReferenceImageTool(context.paths, item);

  const params: AppRuntimeSubagentRunParams = {
    task: buildAnalysisTask(),
    // The run needs a named agent or an inline system prompt; without one it is
    // rejected before it ever reaches a model.
    systemPrompt: buildSystemPrompt(item),
    parentSessionId: context.parentSessionId,
    workspaceId: context.workspaceId,
    platformTools: 'none',
    customTools: [imageTool.definition],
    timeoutMs: RUN_TIMEOUT_MS,
    signal: context.signal,
    repair: {
      maxAttempts: REPAIR_ATTEMPTS,
      validate: (reply) => {
        // Nothing else is worth checking until the model has actually looked.
        if (!imageTool.wasViewed()) {
          return 'You have not viewed the reference image yet. Call `design_library_view_reference`, look at the image, then reply with the JSON object.';
        }
        const parsed = parseAnalysis(reply);
        if (!parsed) return buildRepairMessage(['The reply was not a single JSON object.']);
        const problems = validateAnalysis(parsed.analysis);
        return problems.length === 0 ? null : buildRepairMessage(problems);
      },
    },
    // An empty selection means "use Sero's configured model" (spec §10).
    ...(modelSelectionIsEmpty(context.model) ? {} : { model: context.model.modelId }),
  };

  const result = await context.host.subagents.runStructured(params);

  // Cancellation resolves rather than throws, and reports itself through
  // `error` beginning with 'Aborted'.
  if (context.signal.aborted || result.error?.startsWith('Aborted')) return { status: 'cancelled' };
  if (result.error) return { status: 'failed', reason: result.error };

  // A profile written without seeing the image is invention, however
  // well-formed it looks. Recording it would leave an item that claims to be
  // analysed and quietly poisons every design built from it, so the run fails
  // instead — and the runtime, not the reply, is what decides.
  if (!imageTool.wasViewed()) {
    const detail = imageTool.failure();
    return {
      status: 'failed',
      reason: detail
        ? `The reference image could not be read: ${detail}`
        : 'The Librarian answered without viewing the reference image.',
    };
  }

  const parsed = parseAnalysis(result.response);
  if (!parsed) {
    return { status: 'failed', reason: 'The Librarian did not return a usable JSON object.' };
  }

  const analysis = toLibrarianAnalysis(parsed, {
    ...(result.providerId === undefined ? {} : { providerId: result.providerId }),
    ...(result.modelId === undefined ? {} : { modelId: result.modelId }),
    analysedAt: Date.now(),
    durationMs: result.durationMs ?? Date.now() - startedAt,
    ...(result.usage === undefined ? {} : { tokenUsage: result.usage }),
    ...(result.usage?.costUsd === undefined ? {} : { cost: result.usage.costUsd }),
    promptVersion: 0,
  });

  return { status: 'ok', analysis };
}
