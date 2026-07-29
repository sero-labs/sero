import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';

import type { DesignRecord, DesignVariant } from '../../shared/design';
import { effectiveAnalysis } from '../../shared/librarian';
import type { DesignLibraryPaths } from '../../shared/paths';
import type { ModelSelection, PromptRecipe } from '../../shared/settings';
import { modelSelectionIsEmpty } from '../../shared/settings';
import type { EmittedFile } from '../../shared/targets';
import type { TweakValidation } from '../../shared/tweaks-validate';
import { readItem } from '../store';
import { createEmitFileTool, refuseEmittedSet } from './emit-tool';
import { createNameDesignTool } from './name-tool';
import { createDeclareTweaksTool } from './tweaks-tool';
import {
  buildGenerationRepair,
  buildGenerationSystemPrompt,
  buildGenerationTask,
  type ReferenceLanguage,
} from './prompt';

/**
 * One variant generation run.
 *
 * `platformTools: 'none'` and two custom tools — the one the files are written
 * through, and the one it names the result with. No bash, no read, no write, no
 * workspace and no network. The only thing this run can produce is a set of
 * files the runtime has already checked against the target contract.
 */

const REPAIR_ATTEMPTS = 2;
const RUN_TIMEOUT_MS = 600_000;

const UNCHANGED_REVISION =
  'You have not changed anything. A revise has to write at least one file with `design_library_write_file` — the complete new contents of what you are changing.';

export interface GenerationRunContext {
  host: AppRuntimeHost;
  paths: DesignLibraryPaths;
  workspaceId: string;
  parentSessionId: string;
  model: ModelSelection;
  signal: AbortSignal;
  /**
   * The media capabilities this run may call (spec §6.6, §8.4).
   *
   * Empty when there is no provider key or the per-run cap is zero, and the run
   * is told as much in its task rather than being handed tools that refuse
   * everything — a model that keeps trying a tool that always fails spends the
   * run arguing with it instead of writing the page.
   */
  mediaTools?: ToolDefinition[];
  /** What is left of this run's media allowance, for the task to plan against. */
  mediaCallsRemaining?: number;
}

/**
 * A revise: the page as it stands, and what to change about it (spec §6.4).
 *
 * The run starts holding these files, so an instruction about the header does not
 * make the model restate the rest of the page from memory — which is how a revise
 * loses work nobody asked it to touch.
 */
export interface RevisionRequest {
  instruction: string;
  files: EmittedFile[];
}

export type GenerationOutcome =
  | {
      status: 'ok';
      files: EmittedFile[];
      name: string;
      summary: string;
      refusals: string[];
      /** Null when the run never declared any controls; see the note below. */
      tweaks: TweakValidation | null;
    }
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

export async function runGeneration(
  design: DesignRecord,
  variant: DesignVariant,
  references: ReferenceLanguage[],
  recipe: PromptRecipe | undefined,
  context: GenerationRunContext,
  revision?: RevisionRequest,
): Promise<GenerationOutcome> {
  if (references.length === 0) {
    return {
      status: 'failed',
      reason:
        'Every reference this Design was built from has been permanently deleted, so there is no design language left to generate from.',
    };
  }

  const emitter = createEmitFileTool(design.brief.target, revision?.files ?? []);
  const namer = createNameDesignTool();
  const tweaker = createDeclareTweaksTool(emitter.files);

  const mediaTools = context.mediaTools ?? [];
  const task = buildGenerationTask({
    brief: design.brief,
    guardrails: design.appliedGuardrails,
    references,
    variant,
    variantCount: design.variants.length,
    mediaAvailable: mediaTools.length > 0,
    existingAssets: design.assets,
    ...(context.mediaCallsRemaining === undefined
      ? {}
      : { mediaCallsRemaining: context.mediaCallsRemaining }),
    ...(recipe === undefined ? {} : { recipe }),
    ...(revision === undefined ? {} : { revision }),
  });

  const params: AppRuntimeSubagentRunParams = {
    task,
    systemPrompt: buildGenerationSystemPrompt(),
    parentSessionId: context.parentSessionId,
    workspaceId: context.workspaceId,
    platformTools: 'none',
    customTools: [emitter.definition, namer.definition, tweaker.definition, ...mediaTools],
    timeoutMs: RUN_TIMEOUT_MS,
    signal: context.signal,
    repair: {
      maxAttempts: REPAIR_ATTEMPTS,
      validate: () => {
        const problem = refuseEmittedSet(design.brief.target, emitter.files());
        if (problem) return buildGenerationRepair(problem);
        if (revision !== undefined && emitter.touched().length === 0) {
          return buildGenerationRepair(UNCHANGED_REVISION);
        }
        if (namer.naming() === null) {
          return buildGenerationRepair(
            'You have not named the design. Call `design_library_name_design` with a two or three word name and one sentence on the direction you took.',
          );
        }
        return tweakRepair(tweaker.result());
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

  // A revise that wrote nothing has not revised. Accepting it would store a
  // second, identical revision under an instruction it never carried out — and
  // with `replace`, retire the original in favour of a copy of itself.
  if (revision !== undefined && emitter.touched().length === 0) {
    return { status: 'failed', reason: UNCHANGED_REVISION };
  }

  // A run that wrote the files but never named them is survivable — the page
  // exists and renders — so the variant keeps its number rather than failing on
  // a label. Repair has already asked for the name twice by this point.
  const naming = namer.naming();

  // Tweaks are survivable for the same reason, and it matters more here: the
  // controls are an addition to a page that works without them. A revision with
  // no manifest shows an empty Tweaks tab and can be revised into having one —
  // failing the whole run over it would throw away the page as well.
  return {
    status: 'ok',
    files,
    name: naming?.name ?? '',
    summary: naming?.summary ?? '',
    refusals: emitter.refusals(),
    tweaks: tweaker.result(),
  };
}

/**
 * What to say about the tweak declaration, or null when it is fine.
 *
 * The second case is the one worth a follow-up: every control was dropped, which
 * means the run declared properties its own page does not use. The tool already
 * said which and why, so this only has to ask for the fix.
 */
function tweakRepair(result: TweakValidation | null): string | null {
  if (result === null) {
    return buildGenerationRepair(
      'You have not declared any live controls. Call `design_library_declare_tweaks` with the handful of CSS custom properties worth adjusting on this page.',
    );
  }
  if (result.manifest.controls.length === 0 && result.dropped.length > 0) {
    return buildGenerationRepair(
      'Every control you declared was dropped, so the page has none. Each one must bind to a custom property the page declares and reads through `var()` — add the properties to your CSS, then declare the controls again.',
    );
  }
  return null;
}
