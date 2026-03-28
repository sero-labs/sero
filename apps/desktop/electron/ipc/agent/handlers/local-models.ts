/**
 * Local model management IPC handlers.
 *
 * Reads/writes ~/.sero-ui/agent/models.json (Pi SDK custom models config)
 * and provides helpers for testing connectivity and fetching remote model lists.
 */

import { ipcMain } from 'electron';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { IpcChannels } from '../../../../src/types/ipc';
import type { LocalModelsConfig } from '../../../../src/types/ipc';
import { ensureInfra } from '../../../shared/infra/shared-infra';
import { SERO_AGENT_DIR } from '../../../platform/env';

const MODELS_JSON_PATH = path.join(SERO_AGENT_DIR, 'models.json');

/** Read models.json from disk. Returns empty config if not found. */
async function readModelsConfig(): Promise<LocalModelsConfig> {
  try {
    const raw = await readFile(MODELS_JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return { providers: parsed.providers ?? {} };
  } catch {
    return { providers: {} };
  }
}

/** Write models.json to disk and refresh the model registry. */
async function writeModelsConfig(config: LocalModelsConfig): Promise<void> {
  await mkdir(path.dirname(MODELS_JSON_PATH), { recursive: true });
  await writeFile(MODELS_JSON_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');

  // Refresh the ModelRegistry so new models are immediately available
  const { modelRegistry } = await ensureInfra();
  modelRegistry.refresh();
}

/** Test connectivity to a base URL by hitting the OpenAI-compatible /models endpoint. */
async function testConnection(baseUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = baseUrl.replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${url}/models`, { signal: controller.signal });
      if (res.ok) return { ok: true };
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

interface RemoteModelInfo {
  id: string;
  name?: string;
}

/**
 * Fetch available models from a provider's API.
 * Supports OpenAI-compatible /models and Ollama /api/tags.
 */
async function fetchRemoteModels(baseUrl: string): Promise<RemoteModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    // Try OpenAI-compatible /models first
    const res = await fetch(`${url}/models`, { signal: controller.signal });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data)) {
        return data.data.map((m: { id: string; name?: string }) => ({
          id: m.id,
          name: m.name,
        }));
      }
    }

    // Try Ollama /api/tags (baseUrl might be http://localhost:11434/v1)
    const ollamaBase = url.replace(/\/v1$/, '');
    const ollamaRes = await fetch(`${ollamaBase}/api/tags`, { signal: controller.signal });
    if (ollamaRes.ok) {
      const data = await ollamaRes.json();
      if (Array.isArray(data?.models)) {
        return data.models.map((m: { name: string; model?: string }) => ({
          id: m.name ?? m.model,
          name: m.name,
        }));
      }
    }

    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export function registerLocalModelsHandlers(): void {
  ipcMain.handle(
    IpcChannels.localModels.getConfig,
    async (): Promise<LocalModelsConfig> => {
      return readModelsConfig();
    },
  );

  ipcMain.handle(
    IpcChannels.localModels.saveConfig,
    async (_event, config: LocalModelsConfig): Promise<void> => {
      await writeModelsConfig(config);
    },
  );

  ipcMain.handle(
    IpcChannels.localModels.testConnection,
    async (_event, baseUrl: string): Promise<{ ok: boolean; error?: string }> => {
      return testConnection(baseUrl);
    },
  );

  ipcMain.handle(
    IpcChannels.localModels.fetchRemoteModels,
    async (_event, baseUrl: string): Promise<RemoteModelInfo[]> => {
      return fetchRemoteModels(baseUrl);
    },
  );
}
