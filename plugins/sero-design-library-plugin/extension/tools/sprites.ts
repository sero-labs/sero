/**
 * Sprite Studio's one tool: the page's whole contact with the runtime.
 *
 * Four actions, and the split between them is the plugin's usual one — reads
 * answer straight from plugin-owned records, and every write appends intent for
 * the background runtime, which is the single authoritative writer.
 *
 *   request — append intent. The only way anything changes.
 *   record  — one character or one animation, in full. Summaries live in state;
 *             a screen that needs the measurements asks for the record.
 *   asset   — bytes for a picture the page paints.
 *   frame   — one indexed frame as cells and a palette, for the editor, which
 *             paints palette indexes rather than colours so a hand edit cannot
 *             break the thing the whole pipeline exists to guarantee.
 *   stage   — bytes on their way in: a reference picture, an edited frame, or
 *             the sixty frames the page pulled out of a clip the runtime has no
 *             codec for.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { DesignLibraryPaths } from '../../shared/paths';
import { resolveInsideHome } from '../../shared/paths';
import { appendRequest, readJsonFile } from '../../shared/state-io';
import type { LibraryRequestBody } from '../../shared/requests';
import type { AnimationRecord, CharacterRecord } from '../../sprite-studio/shared/character';
import {
  animationRecordFile,
  characterRecordFile,
} from '../../sprite-studio/shared/paths';
import { isSpriteRequestKind } from '../../sprite-studio/shared/state';
import { decodeIndexedPng } from '../../sprite-studio/runtime/png';
import { STAGING_CHUNK_BYTES, stageChunk } from '../../sprite-studio/runtime/staging';
import { toHex } from '../../sprite-studio/engine/colour';
import { checkId, failure, image, text, type ToolResult } from './result';

const ACTIONS = ['request', 'record', 'asset', 'frame', 'stage'] as const;
type Action = (typeof ACTIONS)[number];

function mediaTypeFor(file: string): string {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.mp4') return 'video/mp4';
  return 'application/octet-stream';
}

export function registerSpriteTool(pi: ExtensionAPI, paths: DesignLibraryPaths): void {
  pi.registerTool({
    name: 'design_library_sprites',
    label: 'Sprite Studio',
    description:
      'Reads and changes Sprite Studio: characters, animations, frames and their files. Every change is submitted as intent for the background runtime to apply.',
    promptSnippet: 'design_library_sprites — Sprite Studio characters, animations and frames',
    parameters: Type.Object({
      action: StringEnum([...ACTIONS], { description: 'What to do.' }),
      body: Type.Optional(
        Type.Unknown({ description: 'For `request`: the request body, including its `kind`.' }),
      ),
      characterId: Type.Optional(Type.String()),
      animationId: Type.Optional(Type.String()),
      /** For `asset` and `frame`: a path relative to the app state directory. */
      filePath: Type.Optional(Type.String()),
      key: Type.Optional(Type.String({ description: 'For `stage`: the staging key.' })),
      name: Type.Optional(Type.String({ description: 'For `stage`: the file name, e.g. `000`.' })),
      index: Type.Optional(Type.Integer({ description: 'For `stage`: the chunk index.' })),
      data: Type.Optional(Type.String({ description: 'For `stage`: base64 bytes.' })),
    }),
    async execute(_toolCallId, params): Promise<ToolResult> {
      const input = params as {
        action: Action;
        body?: unknown;
        characterId?: string;
        animationId?: string;
        filePath?: string;
        key?: string;
        name?: string;
        index?: number;
        data?: string;
      };

      switch (input.action) {
        case 'request': {
          const body = input.body as { kind?: unknown } | undefined;
          // Checked here as well as in the runtime: this tool is reachable from
          // any chat, so a body arriving from outside the page is untrusted.
          if (typeof body?.kind !== 'string' || !isSpriteRequestKind(body.kind)) {
            return failure(`${JSON.stringify(body?.kind ?? null)} is not a Sprite Studio request.`);
          }
          const id = await appendRequest(paths, body as LibraryRequestBody);
          return text(`Submitted ${body.kind}.`, { ok: true, requestId: id });
        }

        case 'record': {
          const character = checkId(input.characterId, 'character id');
          if ('error' in character) return character.error;
          if (input.animationId === undefined) {
            const record = await readJsonFile<CharacterRecord>(
              characterRecordFile(paths, character.id),
            );
            return record === null
              ? failure('That character no longer exists.')
              : text(`${record.name}: ${record.artWidth} × ${record.artHeight}, ${record.palette.length} colours.`, {
                  ok: true,
                  character: record,
                });
          }
          const animation = checkId(input.animationId, 'animation id');
          if ('error' in animation) return animation.error;
          const record = await readJsonFile<AnimationRecord>(
            animationRecordFile(paths, character.id, animation.id),
          );
          return record === null
            ? failure('That animation no longer exists.')
            : text(`${record.plan.name}: ${record.frames.length} frames, ${record.status}.`, {
                ok: true,
                animation: record,
              });
        }

        case 'asset': {
          const file = input.filePath === undefined ? null : resolveInsideHome(paths, input.filePath);
          if (file === null) return failure('That file is not inside Sprite Studio storage.');
          const bytes = await readFile(file).catch(() => null);
          if (bytes === null) return failure('That file no longer exists.');
          return image(bytes.toString('base64'), mediaTypeFor(file), path.basename(file));
        }

        case 'frame': {
          const file = input.filePath === undefined ? null : resolveInsideHome(paths, input.filePath);
          if (file === null) return failure('That frame is not inside Sprite Studio storage.');
          const bytes = await readFile(file).catch(() => null);
          if (bytes === null) return failure('That frame no longer exists.');
          const frame = decodeIndexedPng(bytes);
          return text(`${frame.width} × ${frame.height}, ${frame.palette.length} colours.`, {
            ok: true,
            cols: frame.width,
            rows: frame.height,
            cells: [...frame.cells],
            palette: frame.palette.map((entry) => toHex(entry)),
          });
        }

        case 'stage': {
          const key = checkId(input.key, 'staging key');
          if ('error' in key) return key.error;
          const name = checkId(input.name, 'staged file name');
          if ('error' in name) return name.error;
          if (input.data === undefined || input.index === undefined) {
            return failure('A staged chunk needs both an index and its bytes.');
          }
          const bytes = await stageChunk(paths, key.id, name.id, input.index, input.data);
          return text(`Staged ${bytes} bytes.`, { ok: true, bytes, limit: STAGING_CHUNK_BYTES });
        }
      }
    },
  });
}
