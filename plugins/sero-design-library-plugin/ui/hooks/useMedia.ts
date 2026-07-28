import { useAppTools } from '@sero-ai/app-runtime';
import { useMemo } from 'react';

import type { MediaCapability } from '../../shared/media';

/**
 * The media surface's write path (spec §6.6, §8.4, D5).
 *
 * Every action here queues intent through `design_library_media` and the runtime
 * does the work, because a provider call costs money and the runtime is the only
 * thing holding the budget, the key and the job. Nothing here waits for a
 * result: an asset appears in the tray as soon as it is reserved, and the tray
 * paints whatever the record says about it from then on.
 */

export interface GenerateAssetInput {
  capability: MediaCapability;
  prompt: string;
  /** A sibling asset or a Library item, for image-to-image and upscale. */
  sourceId?: string;
  aspectRatio?: string;
  seed?: number;
  durationSeconds?: number;
}

export interface GenerateIntoLibraryInput {
  capability: MediaCapability;
  prompt: string;
  sourceItemId?: string;
  aspectRatio?: string;
  seed?: number;
  durationSeconds?: number;
}

export interface MediaActions {
  /**
   * Ask for one asset in a Design's tray.
   *
   * Resolves with the reference the page should use, so a caller that wants to
   * paste it somewhere has it without re-reading the record — or `null` when the
   * request was refused, in which case `message` says why.
   */
  generate(
    designId: string,
    input: GenerateAssetInput,
  ): Promise<{ assetId: string; reference: string } | null>;
  retry(designId: string, assetId: string): Promise<void>;
  remove(designId: string, assetId: string): Promise<void>;
  restore(designId: string, assetId: string): Promise<void>;
  purge(designId: string, assetId: string): Promise<void>;
  copyToLibrary(designId: string, assetId: string): Promise<void>;
  generateIntoLibrary(input: GenerateIntoLibraryInput): Promise<{ slotId: string } | null>;
}

export function useMedia(): MediaActions {
  const tools = useAppTools();

  return useMemo<MediaActions>(() => {
    const run = (params: Record<string, unknown>) => tools.run('design_library_media', params);

    return {
      generate: async (designId, input) => {
        const result = await run({ action: 'generate', designId, ...input });
        const details = result.details ?? {};
        // A refusal comes back as an ordinary result rather than a throw, and
        // the absence of an id is what tells the two apart.
        if (typeof details.assetId !== 'string' || typeof details.reference !== 'string') {
          return null;
        }
        return { assetId: details.assetId, reference: details.reference };
      },

      retry: async (designId, assetId) => {
        await run({ action: 'retry', designId, assetId });
      },
      remove: async (designId, assetId) => {
        await run({ action: 'delete', designId, assetId });
      },
      restore: async (designId, assetId) => {
        await run({ action: 'restore', designId, assetId });
      },
      purge: async (designId, assetId) => {
        await run({ action: 'purge', designId, assetId });
      },
      copyToLibrary: async (designId, assetId) => {
        await run({ action: 'copy-to-library', designId, assetId });
      },

      generateIntoLibrary: async (input) => {
        const result = await run({ action: 'generate-into-library', ...input });
        const slotId = (result.details ?? {}).slotId;
        return typeof slotId === 'string' ? { slotId } : null;
      },
    };
  }, [tools]);
}
