import { useAppInfo, useAppState, useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useMemo, useState } from 'react';

import type { GalleryFamilyRecord, GalleryVersionRecord } from '../../shared/gallery';
import type { ExportDestination, ExportSummary } from '../../shared/export';
import type { DesignLibraryState } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';
import { captureGalleryPreview } from '../lib/gallery-capture';

export interface GalleryActions {
  save(target: HTMLElement, designId: string, variantId: string, revisionId: string): Promise<boolean>;
  read(familyId: string, versionId: string): Promise<GalleryVersionRecord | null>;
  feature(familyId: string, versionId: string): Promise<void>;
  favourite(familyId: string, favourite: boolean): Promise<void>;
  open(familyId: string, versionId: string): Promise<boolean>;
  duplicate(familyId: string, versionId: string): Promise<boolean>;
  exportVersion(familyId: string, versionId: string, destination: ExportDestination): Promise<void>;
  removeFamily(familyId: string): Promise<void>;
  restoreFamily(familyId: string): Promise<void>;
  purgeFamily(familyId: string): Promise<void>;
  removeVersion(familyId: string, versionId: string): Promise<void>;
  restoreVersion(familyId: string, versionId: string): Promise<void>;
  purgeVersion(familyId: string, versionId: string): Promise<void>;
}

export function useGallery(): {
  families: GalleryFamilyRecord[];
  trash: GalleryFamilyRecord[];
  saving: boolean;
  error?: string;
  latestExport?: ExportSummary;
  latestExportWorkspaceId?: string;
  actions: GalleryActions;
} {
  const [state] = useAppState<DesignLibraryState>(DEFAULT_STATE);
  const tools = useAppTools();
  const { workspaceId, workspacePath } = useAppInfo();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [visibleExport, setVisibleExport] = useState<{ id: string; workspaceId: string }>();

  const run = useCallback(
    (params: Record<string, unknown>) => tools.run('design_library_gallery', params),
    [tools],
  );
  const runExport = useCallback(
    (params: Record<string, unknown>) => tools.run('design_library_export', params),
    [tools],
  );
  const actions = useMemo<GalleryActions>(() => ({
    read: async (familyId, versionId) => {
      const result = await run({ action: 'get', familyId, versionId });
      return (result.details?.version as GalleryVersionRecord | undefined) ?? null;
    },
    save: async (target, designId, variantId, revisionId) => {
      if (saving) return false;
      setSaving(true);
      setError(undefined);
      let previewUploadId: string | undefined;
      try {
        previewUploadId = await captureGalleryPreview(tools, target);
        const result = await run({ action: 'save', designId, variantId, revisionId, previewUploadId });
        if (typeof result.details?.versionId !== 'string') {
          const message = result.content.find((entry) => entry.type === 'text');
          throw new Error(message && 'text' in message ? String(message.text) : 'The Gallery save was refused.');
        }
        return true;
      } catch (cause) {
        if (previewUploadId !== undefined) {
          await tools.run('design_library_assets', {
            action: 'abort', uploadId: previewUploadId,
          }).catch(() => undefined);
        }
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        setSaving(false);
      }
    },
    feature: async (familyId, versionId) => {
      await run({ action: 'feature', familyId, versionId });
    },
    favourite: async (familyId, favourite) => {
      await run({ action: 'favourite', familyId, favourite });
    },
    open: async (familyId, versionId) => {
      const result = await run({ action: 'open', familyId, versionId });
      return typeof result.details?.designId === 'string';
    },
    duplicate: async (familyId, versionId) => {
      const result = await run({ action: 'duplicate', familyId, versionId });
      return typeof result.details?.designId === 'string';
    },
    exportVersion: async (familyId, versionId, destination) => {
      setError(undefined);
      try {
        const result = await runExport({
          action: 'run', familyId, versionId, destination,
          ...(destination === 'workspace' ? { workspacePath } : {}),
        });
        if (typeof result.details?.exportId !== 'string') {
          const message = result.content.find((entry) => entry.type === 'text');
          throw new Error(message && 'text' in message ? String(message.text) : 'The export was refused.');
        }
        setVisibleExport({ id: result.details.exportId, workspaceId });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    removeFamily: async (familyId) => {
      await run({ action: 'delete-family', familyId });
    },
    restoreFamily: async (familyId) => {
      await run({ action: 'restore-family', familyId });
    },
    purgeFamily: async (familyId) => {
      await run({ action: 'purge-family', familyId });
    },
    removeVersion: async (familyId, versionId) => {
      await run({ action: 'delete-version', familyId, versionId });
    },
    restoreVersion: async (familyId, versionId) => {
      await run({ action: 'restore-version', familyId, versionId });
    },
    purgeVersion: async (familyId, versionId) => {
      await run({ action: 'purge-version', familyId, versionId });
    },
  }), [run, runExport, saving, tools, workspaceId, workspacePath]);

  const families = useMemo(
    () => state.galleryFamilies
      .filter((family) =>
        family.deletedAt === undefined &&
        family.versions.some((version) => version.deletedAt === undefined),
      )
      .toSorted((a, b) => b.updatedAt - a.updatedAt),
    [state.galleryFamilies],
  );
  const trash = useMemo(
    () => state.galleryFamilies.filter((family) =>
      family.deletedAt !== undefined ||
      family.versions.some((version) => version.deletedAt !== undefined),
    ),
    [state.galleryFamilies],
  );
  const latestExport = state.exports.find((entry) => entry.id === visibleExport?.id);
  return {
    families,
    trash,
    saving,
    ...(error === undefined ? {} : { error }),
    ...(latestExport === undefined ? {} : { latestExport }),
    ...(visibleExport === undefined ? {} : { latestExportWorkspaceId: visibleExport.workspaceId }),
    actions,
  };
}
