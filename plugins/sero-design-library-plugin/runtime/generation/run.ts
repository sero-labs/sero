import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';

import type { DesignRecord, DesignVariant } from '../../shared/design';
import { effectiveAnalysis } from '../../shared/librarian';
import type { DesignLibraryPaths } from '../../shared/paths';
import type { ModelSelection, PromptRecipe } from '../../shared/settings';
import { modelSelectionIsEmpty } from '../../shared/settings';
import type { EmittedFile } from '../../shared/targets';
import { readItem } from '../store';
import { createEmitFileTool, refuseEmittedSet } from './emit-tool';
import {
  buildGenerationRepair,
  buildGenerationSystemPrompt,
  buildGenerationTask,
  type ReferenceLanguage,
} from './prompt';

/**
 * One variant generation run.
 *
 * `platformTools: 'none'` and exactly one custom tool — the one the files are
 * written through. No bash, no read, no write, no workspace and no network. The
 * only thing this run can produce is a set of files the runtime has already
 * checked against the target contract.
 */

const REPAIR_ATTEMPTS = 2;
const RUN_TIMEOUT_MS = 600_000;
/** A one-line direction, not an essay. Long replies are truncated, not rejected. */
const MAX_SUMMARY_CHARS = 240;

export interface GenerationRunContext {
  host: AppRuntimeHost;
  paths: DesignLibraryPaths;
  workspaceId: string;
  parentSessionId: string;
  model: ModelSelection;
  signal: AbortSignal;
}

export type GenerationOutcome =
  | { status: 'ok'; files: EmittedFile[]; summary: string; refusals: string[] }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

/**
 * The language each reference contributes, overrides applied.
 *
 * A reference whose item has been purged is skipped rather than failing the run:
 * the Design keeps a tombstone and can still say what it was made from, and a
 * retry months later should not be blocked by a reference the user deleted. A
 * run with nothing left to draw on does fail — there is no language to work in.
 */
export async function collectReferenceLanguage(
  paths: DesignLibraryPaths,
  design: DesignRecord,
): Promise<ReferenceLanguage[]> {
  const ordered = design.references.toSorted((a, b) => a.order - b.order);
  const language: ReferenceLanguage[] = [];
  for (const [order, reference] of ordered.entries()) {
    const item = await readItem(paths, reference.itemId);
    if (!item) continue;
    language.push({ itemId: reference.itemId, order, analysis: effectiveAnalysis(item.profile) });
  }
  return language;
}

function summarise(reply: string): string {
  const line = reply
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry !== '' && !entry.startsWith('#'));
  return (line ?? '').slice(0, MAX_SUMMARY_CHARS);
}

export async function runGeneration(
  design: DesignRecord,
  variant: DesignVariant,
  references: ReferenceLanguage[],
  recipe: PromptRecipe | undefined,
  context: GenerationRunContext,
): Promise<GenerationOutcome> {
  if (references.length === 0) {
    return {
      status: 'failed',
      reason:
        'Every reference this Design was built from has been permanently deleted, so there is no design language left to generate from.',
    };
  }

  const emitter = createEmitFileTool(design.brief.target);

  const params: AppRuntimeSubagentRunParams = {
    task: buildGenerationTask({
      brief: design.brief,
      guardrails: design.appliedGuardrails,
      references,
      variant,
      variantCount: design.variants.length,
      ...(recipe === undefined ? {} : { recipe }),
    }),
    systemPrompt: buildGenerationSystemPrompt(),
    parentSessionId: context.parentSessionId,
    workspaceId: context.workspaceId,
    platformTools: 'none',
    customTools: [emitter.definition],
    timeoutMs: RUN_TIMEOUT_MS,
    signal: context.signal,
    repair: {
      maxAttempts: REPAIR_ATTEMPTS,
      validate: (reply) => {
        const problem = refuseEmittedSet(design.brief.target, emitter.files());
        if (problem) return buildGenerationRepair(problem);
        return summarise(reply) === ''
          ? buildGenerationRepair('Your reply had no text in it.')
          : null;
      },
    },
    ...(modelSelectionIsEmpty(context.model) ? {} : { model: context.model.modelId }),
  };

  const result = await context.host.subagents.runStructured(params);

  if (context.signal.aborted || result.error?.startsWith('Aborted')) return { status: 'cancelled' };
  if (result.error) return { status: 'failed', reason: result.error };

  // The runtime decides whether a design was produced, not the reply. A model
  // that describes a page it never wrote returns a perfectly plausible sentence,
  // and accepting it would leave a variant marked ready with nothing to render.
  const files = emitter.files();
  const problem = refuseEmittedSet(design.brief.target, files);
  if (problem) {
    const refused = emitter.refusals();
    return {
      status: 'failed',
      reason:
        refused.length > 0
          ? `${problem} Rejected on the way in: ${[...new Set(refused)].join(', ')}.`
          : problem,
    };
  }

  return {
    status: 'ok',
    files,
    // An empty summary is survivable — the variant renders either way, and the
    // revision selector can fall back to its number.
    summary: summarise(result.response),
    refusals: emitter.refusals(),
  };
}
