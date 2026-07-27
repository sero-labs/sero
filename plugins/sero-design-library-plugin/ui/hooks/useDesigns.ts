import type { AppToolResult } from '@sero-ai/common';
import { useAppState, useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useMemo } from 'react';

import type { DesignBrief, DesignRecord } from '../../shared/design';
import type { ConflictResolution, GuardrailSynthesis } from '../../shared/synthesis';
import type { DesignLibraryState, DesignSummary } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';

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
}

export interface DesignActions {
  synthesis(referenceItemIds: string[]): Promise<GuardrailSynthesis | null>;
  create(input: CreateDesignInput): Promise<{ ok: boolean; message: string }>;
  open(designId: string | undefined): Promise<void>;
  selectVariant(variantId: string): Promise<void>;
  read(designId: string): Promise<DesignRecord | null>;
  retryVariant(designId: string, variantId: string): Promise<void>;
  cancelVariant(designId: string, variantId: string): Promise<void>;
  remove(designId: string): Promise<void>;
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
        const result = await run({ action: 'create', ...input });
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
      remove: async (designId) => {
        await run({ action: 'delete', designId });
      },
    }),
    [run, tools],
  );

  const list = useMemo(
    () =>
      state.designs
        .filter((design) => design.deletedAt === undefined)
        .toSorted((a, b) => b.createdAt - a.createdAt),
    [state.designs],
  );

  const open = useMemo(
    () => list.find((design) => design.id === state.view.selectedDesignId),
    [list, state.view.selectedDesignId],
  );

  return { state, list, open, actions };
}
