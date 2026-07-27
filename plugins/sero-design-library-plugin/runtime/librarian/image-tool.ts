import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppRuntimeHost } from '@sero-ai/common';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { DesignLibraryPaths } from '../../shared/paths';
import { itemDir } from '../../shared/paths';
import type { ItemRecord } from '../../shared/records';

/**
 * Handing the reference image to the Librarian.
 *
 * The obvious approach — give the session the read tool and an absolute path —
 * does not work: a Library item lives in the profile's app directory, and the
 * platform read tool is scoped to the workspace, so it refuses the path. The
 * model then has nothing to look at and, left to its own devices, writes a
 * confident profile about an image it never saw.
 *
 * So the bytes come through a tool the runtime owns. It runs in-process, where
 * plugin-owned files are simply readable, and returns the image itself. That
 * removes the filesystem from the picture entirely: the session can be given
 * no platform tools at all, which is stricter than read-only, and it behaves
 * the same whether the workspace runs on the host or in a container.
 *
 * The tool also records whether it was ever called. That is the load-bearing
 * part — an analysis produced without calling it is invention, and the caller
 * needs to be able to tell the difference rather than take the reply's word.
 *
 * The bytes go through the host's image budget on the way out, the same one
 * the chat panel and the browser tools use. References are often full-window
 * screenshots at retina resolution, and sending those untouched spends a large
 * part of the context window on pixels the model does not need — quietly making
 * the analysis worse rather than failing.
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

function mimeTypeFor(item: ItemRecord): string {
  if (item.asset.mediaType.startsWith('image/')) return item.asset.mediaType;
  return MIME_BY_EXTENSION[path.extname(item.asset.originalFile).toLowerCase()] ?? 'image/png';
}

export interface ReferenceImageTool {
  definition: ToolDefinition;
  /** True once the model has actually been given the pixels. */
  wasViewed(): boolean;
  /** Set when the image could not be read, so the failure names itself. */
  failure(): string | null;
}

/**
 * Shrink to the host's image budget. A host without the capability — an older
 * shell, or a test harness — sends the original rather than failing the run:
 * a larger image still analyses correctly, it just costs more.
 */
async function withinBudget(
  host: AppRuntimeHost,
  data: string,
  mimeType: string,
  caption: string,
): Promise<{ data: string; mimeType: string; caption: string }> {
  const prepared = await host.media?.prepareImage(data, mimeType, caption).catch(() => null);
  if (!prepared) return { data, mimeType, caption };
  return {
    data: prepared.data,
    mimeType: prepared.mimeType,
    // The note carries the original dimensions when it was scaled, which the
    // analysis needs to describe the reference at its real size.
    caption: prepared.text ?? caption,
  };
}

export function createReferenceImageTool(
  host: AppRuntimeHost,
  paths: DesignLibraryPaths,
  item: ItemRecord,
): ReferenceImageTool {
  let viewed = false;
  let failure: string | null = null;

  const definition: ToolDefinition = {
    name: 'design_library_view_reference',
    label: 'View Reference',
    description:
      'Returns the reference image you have been asked to analyse. Call this first — it is the only way to see the image.',
    promptSnippet: 'design_library_view_reference — returns the reference image to analyse',
    parameters: Type.Object({}),
    async execute() {
      // The original, not the stored preview. The preview is a 768px thumbnail
      // built for the grid; the budget below lands nearer 1600px, so starting
      // from the original gives the model markedly more to look at for the same
      // trip through the resizer.
      const file = path.join(itemDir(paths, item.id), item.asset.originalFile);
      const bytes = await readFile(file).catch((error: unknown) => {
        failure = error instanceof Error ? error.message : String(error);
        return null;
      });

      if (!bytes) {
        return {
          content: [{ type: 'text' as const, text: `The reference image could not be read: ${failure}` }],
          details: { ok: false },
          isError: true,
        };
      }

      const prepared = await withinBudget(
        host,
        bytes.toString('base64'),
        mimeTypeFor(item),
        'The reference image follows. Analyse this image.',
      );

      viewed = true;
      return {
        content: [
          { type: 'text' as const, text: prepared.caption },
          { type: 'image' as const, data: prepared.data, mimeType: prepared.mimeType },
        ],
        details: {
          ok: true,
          bytes: bytes.byteLength,
          sentBytes: Math.floor((prepared.data.length * 3) / 4),
        },
      };
    },
  };

  return {
    definition,
    wasViewed: () => viewed,
    failure: () => failure,
  };
}
