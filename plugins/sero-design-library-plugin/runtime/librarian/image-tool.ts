import { readFile } from 'node:fs/promises';
import path from 'node:path';

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

export function createReferenceImageTool(
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
      // The original, not the downscaled preview: analysis should see what the
      // user actually collected.
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

      viewed = true;
      return {
        content: [
          { type: 'text' as const, text: 'The reference image follows. Analyse this image.' },
          { type: 'image' as const, data: bytes.toString('base64'), mimeType: mimeTypeFor(item) },
        ],
        details: { ok: true, bytes: bytes.byteLength },
      };
    },
  };

  return {
    definition,
    wasViewed: () => viewed,
    failure: () => failure,
  };
}
