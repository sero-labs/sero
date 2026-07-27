/**
 * The UI's only route to plugin behaviour.
 *
 * Every mutation goes through an app tool; the UI never touches the
 * filesystem, never adds a host bridge and never writes a domain record.
 */

import { useAppState, useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useMemo } from 'react';
import { DEFAULT_STATE, type DesignLibraryState } from '../shared/state';
import type { TweakValue } from '../shared/tweak-types';

export interface ToolResult {
  text: string;
  details: Record<string, unknown> | null;
  isError: boolean;
  content?: Array<{ type: string; data?: string; mimeType?: string; text?: string }>;
}

/** 512 KiB of base64 per call — the tool enforces the same bound. */
const CHUNK_SIZE = 512 * 1024;

export function useDesignLibrary() {
  const [state, updateState] = useAppState<DesignLibraryState>(DEFAULT_STATE);
  const { run } = useAppTools();

  const call = useCallback(
    async (tool: string, params: Record<string, unknown>): Promise<ToolResult> =>
      (await run(tool, params)) as ToolResult,
    [run],
  );

  const actions = useMemo(() => ({
    call,

    /** One bounded pipeline for the file picker, drag-and-drop and paste. */
    async importImage(file: File, source: 'file-picker' | 'drag-drop' | 'clipboard') {
      const begin = await call('design_library_assets', {
        action: 'upload_begin',
        fileName: file.name || 'pasted-image.png',
        mimeType: file.type || 'image/png',
        source,
      });
      const uploadId = begin.details?.uploadId;
      if (begin.isError || typeof uploadId !== 'string') {
        return { ok: false as const, message: begin.text };
      }

      const base64 = await fileToBase64(file);
      for (let offset = 0; offset < base64.length; offset += CHUNK_SIZE) {
        const chunk = await call('design_library_assets', {
          action: 'upload_chunk',
          uploadId,
          chunk: base64.slice(offset, offset + CHUNK_SIZE),
        });
        if (chunk.isError) {
          await call('design_library_assets', { action: 'upload_cancel', uploadId });
          return { ok: false as const, message: chunk.text };
        }
      }

      const finish = await call('design_library_assets', { action: 'upload_finish', uploadId });
      return {
        ok: !finish.isError,
        message: finish.text,
        duplicate: finish.details?.duplicate === true,
        itemId: typeof finish.details?.itemId === 'string' ? finish.details.itemId : undefined,
      };
    },

    updateField: (itemId: string, field: string, value: unknown) =>
      call('design_library_items', { action: 'update_field', itemId, field, value }),
    resetField: (itemId: string, field: string) =>
      call('design_library_items', { action: 'reset_field', itemId, field }),
    itemLifecycle: (itemId: string, action: 'soft_delete' | 'restore' | 'purge') =>
      call('design_library_items', { action, itemId }),
    getItem: (itemId: string) => call('design_library_items', { action: 'get', itemId }),
    analyse: (itemId: string, action: 'analyse' | 'reanalyse' | 'cancel' | 'retry' = 'analyse') =>
      call('design_library_analysis', { action, itemId }),

    createDesign: (params: {
      title: string;
      request: string;
      outputTarget: string;
      itemIds: string[];
    }) => call('design_library_designs', { action: 'create', ...params }),
    generate: (designId: string, variantCount: number) =>
      call('design_library_designs', { action: 'generate', designId, variantCount }),
    openDesign: (designId: string) => call('design_library_designs', { action: 'open', designId }),
    revise: (designId: string, variantId: string, instruction: string, behaviour: string) =>
      call('design_library_designs', { action: 'revise', designId, variantId, instruction, behaviour }),
    resolveConflict: (designId: string, always: string, never: string, resolution: string) =>
      call('design_library_designs', { action: 'resolve_conflict', designId, always, never, resolution }),
    variantAction: (designId: string, variantId: string, action: 'retry_variant' | 'cancel_variant') =>
      call('design_library_designs', { action, designId, variantId }),
    readPreview: (designId: string, variantId: string) =>
      call('design_library_designs', { action: 'read_preview', designId, variantId }),
    saveTweaks: (designId: string, variantId: string, overrides: Record<string, TweakValue>) =>
      call('design_library_designs', { action: 'update_tweak', designId, variantId, overrides }),
    resetTweak: (designId: string, variantId: string, controlId?: string) =>
      call('design_library_designs', {
        action: controlId ? 'reset_tweak' : 'reset_all_tweaks',
        designId,
        variantId,
        ...(controlId ? { controlId } : {}),
      }),
    checkpointTweaks: (designId: string, variantId: string, reason: string) =>
      call('design_library_designs', { action: 'checkpoint_tweaks', designId, variantId, reason }),
    copyTweakCss: (designId: string, variantId: string) =>
      call('design_library_designs', { action: 'copy_tweak_css', designId, variantId }),

    designAssets: (designId: string, action: 'list' | 'retry' | 'delete' | 'promote', assetId?: string) =>
      call('design_library_design_assets', { action, designId, ...(assetId ? { assetId } : {}) }),

    saveToGallery: (designId: string, variantId: string, familyId?: string) =>
      call('design_library_gallery', {
        action: 'save',
        designId,
        variantId,
        ...(familyId ? { familyId } : {}),
      }),
    galleryAction: (
      action: 'feature' | 'read_version' | 'read_preview' | 'duplicate' | 'remix' | 'delete' | 'restore' | 'purge' | 'open',
      params: Record<string, unknown>,
    ) => call('design_library_gallery', { action, ...params }),
    exportVersion: (familyId: string, versionId: string, destination: 'downloads' | 'workspace') =>
      call('design_library_export', { familyId, versionId, destination }),

    updateSettings: (params: { variantCount?: number; revisionBehaviour?: string }) =>
      call('design_library_settings', { action: 'set', ...params }),
    dismissNotice: (noticeId: string) =>
      call('design_library_settings', { action: 'dismiss_notice', noticeId }),
  }), [call]);

  return { state, updateState, actions };
}

export type DesignLibraryActions = ReturnType<typeof useDesignLibrary>['actions'];

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}
