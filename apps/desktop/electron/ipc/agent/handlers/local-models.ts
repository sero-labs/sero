/**
 * Local model management IPC handlers.
 *
 * Reads/writes ~/.sero-ui/agent/models.json (Pi SDK custom models config)
 * and provides helpers for testing connectivity and fetching remote model lists.
 */

import { execSync } from 'child_process';
import { ipcMain } from 'electron';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  LocalModelApi,
  LocalModelsConfig,
  LocalModelsSaveResult,
  LocalModelsConnectionRequest,
  LocalRemoteModelInfo,
} from '@/types/ipc';
import { refreshModelAvailability } from '@electron/ipc/agent/core/model-availability-refresh';
import { SERO_AGENT_DIR } from '@electron/platform/env';

const MODELS_JSON_PATH = path.join(SERO_AGENT_DIR, 'models.json');
const ANTHROPIC_VERSION = '2023-06-01';
const KEYLESS_PROVIDER_AUTH = 'none';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function resolveConfigValue(config?: string): string | undefined {
  if (!config) return undefined;
  if (config.startsWith('!')) {
    try {
      const output = execSync(config.slice(1), {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return output.trim() || undefined;
    } catch {
      return undefined;
    }
  }
  let missingEnvironmentValue = false;
  const resolved = config.replace(
    /\$\$|\$!|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, bracedName: string | undefined, plainName: string | undefined) => {
      if (match === '$$') return '$';
      if (match === '$!') return '!';
      const value = process.env[bracedName ?? plainName ?? ''];
      if (value === undefined) missingEnvironmentValue = true;
      return value ?? '';
    },
  );
  return missingEnvironmentValue ? undefined : resolved;
}

function resolveHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return undefined;
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const resolvedValue = resolveConfigValue(value);
    if (resolvedValue) resolved[key] = resolvedValue;
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

function joinUrl(baseUrl: string, pathname: string): string {
  try {
    const url = new URL(baseUrl);
    const basePath = url.pathname.replace(/\/+$/, '');
    const nextPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    url.pathname = `${basePath}${nextPath}`;
    return url.toString();
  } catch {
    return `${baseUrl.replace(/\/+$/, '')}/${pathname.replace(/^\/+/, '')}`;
  }
}

function appendQueryParam(urlString: string, key: string, value: string): string {
  try {
    const url = new URL(urlString);
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    return url.toString();
  } catch {
    const separator = urlString.includes('?') ? '&' : '?';
    return `${urlString}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

function buildRequestHeaders(request: LocalModelsConnectionRequest): Record<string, string> | undefined {
  const headers = { ...(resolveHeaders(request.headers) ?? {}) };
  const apiKey = resolveConfigValue(request.apiKey);

  switch (request.api) {
    case 'openai-completions':
    case 'openai-responses': {
      const shouldAttachBearer = request.authHeader ?? true;
      if (apiKey && apiKey !== 'none' && shouldAttachBearer && !headers.Authorization) {
        headers.Authorization = `Bearer ${apiKey}`;
      }
      break;
    }
    case 'anthropic-messages':
      if (apiKey && apiKey !== 'none' && !headers['x-api-key']) {
        headers['x-api-key'] = apiKey;
      }
      if (!headers['anthropic-version']) {
        headers['anthropic-version'] = ANTHROPIC_VERSION;
      }
      headers.accept ??= 'application/json';
      break;
    case 'google-generative-ai':
      if (apiKey && apiKey !== 'none' && !headers['x-goog-api-key']) {
        headers['x-goog-api-key'] = apiKey;
      }
      break;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function buildModelsEndpoint(request: LocalModelsConnectionRequest): string {
  const modelsUrl = joinUrl(request.baseUrl, '/models');
  if (request.api !== 'google-generative-ai') return modelsUrl;

  const apiKey = resolveConfigValue(request.apiKey);
  return apiKey && apiKey !== 'none'
    ? appendQueryParam(modelsUrl, 'key', apiKey)
    : modelsUrl;
}

async function fetchJson(
  url: string,
  headers: Record<string, string> | undefined,
  signal: AbortSignal,
): Promise<unknown> {
  const res = await fetch(url, { headers, signal });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

function parseOpenAiModels(data: unknown): LocalRemoteModelInfo[] {
  if (!data || typeof data !== 'object' || !('data' in data) || !Array.isArray(data.data)) {
    return [];
  }
  return data.data.flatMap((model) => {
    if (!model || typeof model !== 'object' || !('id' in model) || typeof model.id !== 'string') {
      return [];
    }
    return [{
      id: model.id,
      name:
        ('name' in model && typeof model.name === 'string' ? model.name : undefined)
        ?? ('display_name' in model && typeof model.display_name === 'string'
          ? model.display_name
          : undefined),
    }];
  });
}

function parseOllamaModels(data: unknown): LocalRemoteModelInfo[] {
  if (!data || typeof data !== 'object' || !('models' in data) || !Array.isArray(data.models)) {
    return [];
  }
  return data.models.flatMap((model) => {
    if (!model || typeof model !== 'object') return [];
    const id =
      ('model' in model && typeof model.model === 'string' ? model.model : undefined)
      ?? ('name' in model && typeof model.name === 'string' ? model.name : undefined);
    if (!id) return [];
    return [{
      id,
      name: 'name' in model && typeof model.name === 'string' ? model.name : undefined,
    }];
  });
}

function parseGoogleModels(data: unknown): LocalRemoteModelInfo[] {
  if (!data || typeof data !== 'object' || !('models' in data) || !Array.isArray(data.models)) {
    return [];
  }
  return data.models.flatMap((model) => {
    if (!model || typeof model !== 'object' || !('name' in model) || typeof model.name !== 'string') {
      return [];
    }
    const id = model.name.replace(/^models\//, '');
    return [{
      id,
      name: 'displayName' in model && typeof model.displayName === 'string'
        ? model.displayName
        : id,
    }];
  });
}

async function fetchOpenAiCompatibleModels(
  request: LocalModelsConnectionRequest,
  signal: AbortSignal,
): Promise<LocalRemoteModelInfo[]> {
  const headers = buildRequestHeaders(request);
  const modelsUrl = buildModelsEndpoint(request);
  let primaryError: string | null = null;

  try {
    const data = await fetchJson(modelsUrl, headers, signal);
    return parseOpenAiModels(data);
  } catch (error) {
    primaryError = toErrorMessage(error);
  }

  const ollamaBaseUrl = request.baseUrl.replace(/\/v1\/?$/, '');
  const ollamaTagsUrl = joinUrl(ollamaBaseUrl, '/api/tags');
  try {
    const data = await fetchJson(ollamaTagsUrl, headers, signal);
    return parseOllamaModels(data);
  } catch (error) {
    const fallbackError = toErrorMessage(error);
    throw new Error(primaryError ? `${primaryError}; ${fallbackError}` : fallbackError);
  }
}

async function fetchAnthropicModels(
  request: LocalModelsConnectionRequest,
  signal: AbortSignal,
): Promise<LocalRemoteModelInfo[]> {
  const data = await fetchJson(buildModelsEndpoint(request), buildRequestHeaders(request), signal);
  return parseOpenAiModels(data);
}

async function fetchGoogleModels(
  request: LocalModelsConnectionRequest,
  signal: AbortSignal,
): Promise<LocalRemoteModelInfo[]> {
  const data = await fetchJson(buildModelsEndpoint(request), buildRequestHeaders(request), signal);
  return parseGoogleModels(data);
}

/** Read models.json from disk. Returns empty config if not found. */
async function readModelsConfig(): Promise<LocalModelsConfig> {
  let raw: string | null = null;
  try {
    raw = await readFile(MODELS_JSON_PATH, 'utf8');
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }

  if (raw === null) return { providers: {} };
  return JSON.parse(raw) as LocalModelsConfig;
}

function normalizeModelsConfigForPi(config: LocalModelsConfig): LocalModelsConfig {
  return {
    ...config,
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([name, provider]) => [
        name,
        {
          ...provider,
          apiKey: provider.apiKey?.trim() || KEYLESS_PROVIDER_AUTH,
        },
      ]),
    ),
  };
}

/** Write models.json to disk. The shared refresh flow validates and reloads it. */
async function writeModelsConfig(config: LocalModelsConfig): Promise<void> {
  await mkdir(path.dirname(MODELS_JSON_PATH), { recursive: true });
  const normalizedConfig = normalizeModelsConfigForPi(config);
  await writeFile(MODELS_JSON_PATH, JSON.stringify(normalizedConfig, null, 2) + '\n', 'utf8');
}

/** Test connectivity using the selected API and auth settings. */
async function testConnection(
  request: LocalModelsConnectionRequest,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetchRemoteModels(request, controller.signal);
      return { ok: true };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/**
 * Fetch available models from a provider's API.
 * Supports OpenAI-compatible /models, Anthropic /models,
 * Google Generative AI /models, and Ollama /api/tags.
 */
async function fetchRemoteModels(
  request: LocalModelsConnectionRequest,
  signal?: AbortSignal,
): Promise<LocalRemoteModelInfo[]> {
  const controller = signal ? null : new AbortController();
  const activeSignal = signal ?? controller!.signal;
  const timeout = controller ? setTimeout(() => controller.abort(), 10000) : null;

  try {
    const trimmedBaseUrl = request.baseUrl.trim();
    if (!trimmedBaseUrl) throw new Error('Base URL is required');

    const normalizedRequest = { ...request, baseUrl: trimmedBaseUrl };
    switch (normalizedRequest.api) {
      case 'openai-completions':
      case 'openai-responses':
        return fetchOpenAiCompatibleModels(normalizedRequest, activeSignal);
      case 'anthropic-messages':
        return fetchAnthropicModels(normalizedRequest, activeSignal);
      case 'google-generative-ai':
        return fetchGoogleModels(normalizedRequest, activeSignal);
      default: {
        const unsupportedApi: never = normalizedRequest.api;
        throw new Error(`Unsupported API type: ${unsupportedApi as LocalModelApi}`);
      }
    }
  } finally {
    if (timeout) clearTimeout(timeout);
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
    async (_event, config: LocalModelsConfig): Promise<LocalModelsSaveResult> => {
      await writeModelsConfig(config);
      const result = await refreshModelAvailability();
      return { warning: result.registryError };
    },
  );

  ipcMain.handle(
    IpcChannels.localModels.testConnection,
    async (
      _event,
      request: LocalModelsConnectionRequest,
    ): Promise<{ ok: boolean; error?: string }> => {
      return testConnection(request);
    },
  );

  ipcMain.handle(
    IpcChannels.localModels.fetchRemoteModels,
    async (_event, request: LocalModelsConnectionRequest): Promise<LocalRemoteModelInfo[]> => {
      return fetchRemoteModels(request);
    },
  );
}
