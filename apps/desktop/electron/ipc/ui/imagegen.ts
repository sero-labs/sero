/**
 * ImageGen IPC handlers — direct image generation + file reading from renderer.
 *
 * Two channels:
 *   sero:imagegen:generate  — generate images via the image agent
 *   sero:imagegen:read-image — read a saved image as a data URI
 */

import { ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { IpcChannels } from '../../../src/types/ipc';
import { workspaceManager } from '../../workspace/manager';
import {
  generateImages,
  exposeImageAgent,
  type ImageGenParams,
  type ImageGenResult,
} from '../../agents/image-agent';

// ── State file helpers ──

const STATE_REL = path.join('.sero', 'apps', 'imagegen', 'state.json');
const IMAGES_REL = path.join('.sero', 'apps', 'imagegen', 'images');

interface ImageGenState {
  generations: any[];
  nextId: number;
}

async function readState(statePath: string): Promise<ImageGenState> {
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { generations: [], nextId: 1 };
  }
}

async function writeState(statePath: string, state: ImageGenState): Promise<void> {
  const dir = path.dirname(statePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${statePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, statePath);
}

// ── Registration ──

export function registerImagegenHandlers(): void {
  // Expose the image agent on globalThis for extension bridge
  exposeImageAgent();

  ipcMain.handle(
    IpcChannels.imagegen.generate,
    async (
      _event,
      workspaceId: string,
      params: ImageGenParams,
    ): Promise<{ generation: any; error?: string }> => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error('No workspace path');

      const imagesDir = path.join(wsPath, IMAGES_REL);
      const statePath = path.join(wsPath, STATE_REL);

      const result: ImageGenResult = await generateImages(params, imagesDir);

      if (result.images.length === 0) {
        return { generation: null, error: result.error ?? 'No images generated' };
      }

      // Build generation record and persist to state
      const state = await readState(statePath);
      const generation = {
        id: state.nextId,
        prompt: params.prompt,
        negativePrompt: params.negativePrompt,
        model: params.model,
        aspectRatio: params.aspectRatio,
        images: result.images,
        createdAt: new Date().toISOString(),
      };
      state.generations.unshift(generation);
      state.nextId++;
      await writeState(statePath, state);

      return { generation, error: result.error };
    },
  );

  ipcMain.handle(
    IpcChannels.imagegen.deleteImage,
    async (
      _event,
      workspaceId: string,
      generationId: number,
      singleImageId?: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error('No workspace path');

      const statePath = path.join(wsPath, STATE_REL);
      const state = await readState(statePath);

      const idx = state.generations.findIndex((g: any) => g.id === generationId);
      if (idx === -1) return { ok: false, error: 'Image not found' };

      const gen = state.generations[idx];

      if (singleImageId) {
        // Remove a single image from the generation
        const imgIdx = gen.images.findIndex((img: any) => img.id === singleImageId);
        if (imgIdx === -1) return { ok: false, error: 'Image not found' };

        const [removed] = gen.images.splice(imgIdx, 1);
        try { await fs.unlink(removed.filePath); } catch { /* already gone */ }

        // If no images remain, remove the entire generation
        if (gen.images.length === 0) {
          state.generations.splice(idx, 1);
        }
      } else {
        // Remove the entire generation and all its files
        const [removed] = state.generations.splice(idx, 1);
        for (const img of removed.images ?? []) {
          try { await fs.unlink(img.filePath); } catch { /* already gone */ }
        }
      }

      await writeState(statePath, state);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannels.imagegen.readImage,
    async (_event, filePath: string): Promise<string> => {
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime =
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'webp'
            ? 'image/webp'
            : 'image/png';
      return `data:${mime};base64,${data.toString('base64')}`;
    },
  );
}
