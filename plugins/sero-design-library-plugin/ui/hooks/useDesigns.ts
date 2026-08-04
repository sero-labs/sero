import type { AppToolResult } from '@sero-ai/common';
import { useAppState, useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useMemo } from 'react';

import type { DesignBrief, DesignRecord } from '../../shared/design';
import { normalizeDesignIndex } from '../../shared/indexes';
import type { LayoutSettings, RevisionBehaviour } from '../../shared/settings';
import type { ConflictResolution, GuardrailSynthesis } from '../../shared/synthesis';
import type { DesignLibraryState, DesignSummary } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';
import { showItemInFolder } from '../lib/host-files';
import { useJsonIndex } from './useJsonIndex';

/**
 * The Design surface's read and write path.
 *
 * Summaries come from reactive state; the full record — guardrails, revisions,
 * file lists — is read on demand through the tool, because a Design carries far
 * more than the index should. Every mutation goes through the same tool, so the
 * runtime stays the only writer.
 */

export interface CreateDesignInput {
  referenceItemIds: string[];
  request: string;
  title?: string;
  recipeId?: string;
  target: DesignBrief['target'];
  variationMode: DesignBrief['variationMode'];
  variantCount: number;
  inspirationStrength: DesignBrief['inspirationStrength'];
  resolutions: ConflictResolution[];
  /** Rules the user added for this Design alone. */
  sessionRules: string[];
  galleryParent?: { familyId: string; versionId: string };
}

export interface DesignActions {
  synthesis(referenceItemIds: string[]): Promise<GuardrailSynthesis | null>;
  create(input: CreateDesignInput): Promise<{ ok: boolean; message: string }>;
  open(designId: string | undefined): Promise<void>;
  selectVariant(variantId: string): Promise<void>;
  read(designId: string): Promise<DesignRecord | null>;
  retryVariant(designId: string, variantId: string): Promise<void>;
  cancelVariant(designId: string, variantId: string): Promise<void>;
  /** Another run on this variant, carrying what to change (spec §6.4). */
  reviseVariant(
    designId: string,
    variantId: string,
    instruction: string,
    behaviour: RevisionBehaviour,
  ): Promise<void>;
  showRevision(designId: string, variantId: string, revisionId: string): Promise<void>;
  /** Reveal one revision's directory through the generic desktop shell bridge. */
  openFiles(designId: string, variantId: string, revisionId: string): Promise<void>;
  remove(designId: string): Promise<void>;
  /** Panel width and rail state, persisted like every other preference. */
  setLayout(patch: Partial<LayoutSettings>): Promise<void>;
  /** The default a revise takes, answered on the revise bar and remembered. */
  setRevisionBehaviour(behaviour: RevisionBehaviour): Promise<void>;
}

export interface Designs {
  state: DesignLibraryState;
  /** Live Designs, newest first. */
  list: DesignSummary[];
  open: DesignSummary | undefined;
  actions: DesignActions;
}

function detailsOf(result: AppToolResult): Record<string, unknown> {
  return result.details ?? {};
}

function textOf(result: AppToolResult): string {
  const block = result.content.find((entry) => entry.type === 'text');
  return block && 'text' in block ? String(block.text) : '';
}

export function useDesigns(): Designs {
  const [state] = useAppState<DesignLibraryState>(DEFAULT_STATE);
  const designIndex = useJsonIndex('designs/index.json', normalizeDesignIndex);
  const tools = useAppTools();

  const run = useCallback(
    (params: Record<string, unknown>) => tools.run('design_library_designs', params),
    [tools],
  );

  const actions = useMemo<DesignActions>(
    () => ({
      synthesis: async (referenceItemIds) => {
        const result = await run({ action: 'synthesis', referenceItemIds });
        const synthesis = detailsOf(result).synthesis;
        return (synthesis as GuardrailSynthesis | undefined) ?? null;
      },

      create: async (input) => {
        const { galleryParent, ...request } = input;
        const result = await run({
          action: 'create',
          ...request,
          ...(galleryParent === undefined
            ? {}
            : {
                galleryParentFamilyId: galleryParent.familyId,
                galleryParentVersionId: galleryParent.versionId,
              }),
        });
        // A refusal comes back as an ordinary result, not a throw, and the text
        // is written to be shown: it names the reference or the conflict.
        const ok = detailsOf(result).ok !== false && detailsOf(result).designId !== undefined;
        return { ok, message: textOf(result) };
      },

      open: async (designId) => {
        // `null` clears; `undefined` would be dropped by JSON on the way to the
        // runtime and the old selection would survive.
        await tools.run('design_library_settings', {
          action: 'set-view',
          view: { selectedDesignId: designId ?? null, activeVariantId: null },
        });
      },

      selectVariant: async (activeVariantId) => {
        await tools.run('design_library_settings', {
          action: 'set-view',
          view: { activeVariantId },
        });
      },

      read: async (designId) => {
        const result = await run({ action: 'get', designId });
        return (detailsOf(result).design as DesignRecord | undefined) ?? null;
      },

      retryVariant: async (designId, variantId) => {
        await run({ action: 'retry-variant', designId, variantId });
      },
      cancelVariant: async (designId, variantId) => {
        await run({ action: 'cancel-variant', designId, variantId });
      },
      reviseVariant: async (designId, variantId, instruction, behaviour) => {
        await run({ action: 'revise-variant', designId, variantId, instruction, behaviour });
      },
      showRevision: async (designId, variantId, revisionId) => {
        await run({ action: 'show-revision', designId, variantId, revisionId });
      },
      openFiles: async (designId, variantId, revisionId) => {
        const result = await run({ action: 'files-location', designId, variantId, revisionId });
        const folder = detailsOf(result).folder;
        if (typeof folder === 'string') await showItemInFolder(folder);
      },
      remove: async (designId) => {
        await run({ action: 'delete', designId });
      },
      setLayout: async (patch) => {
        // `set-layout` fills in whichever key is absent from the stored value,
        // so a partial patch is safe here in a way `settings.update` is not.
        await tools.run('design_library_settings', { action: 'set-layout', ...patch });
      },
      setRevisionBehaviour: async (revisionBehaviour) => {
        await tools.run('design_library_settings', { action: 'set-generation', revisionBehaviour });
      },
    }),
    [run, tools],
  );

  const list = useMemo(
    () =>
      designIndex
        .filter((design) => design.deletedAt === undefined)
        .toSorted((a, b) => b.createdAt - a.createdAt),
    [designIndex],
  );

  const open = useMemo(
    () => list.find((design) => design.id === state.view.selectedDesignId),
    [list, state.view.selectedDesignId],
  );

  return { state, list, open, actions };
}
