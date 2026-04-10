import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { AvailableModelGroup, ProviderHealthInfo, ProviderHealthStatus } from '@/types/ipc';
import type { LocalModelsConfig } from '@/types/local-models';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { ensureInfra } from '@electron/shared/infra/shared-infra';
import {
  getApiKeyProviderCatalog,
  getOAuthProviderCatalog,
  getProviderEnvApiKey,
} from '@electron/shared/auth/provider-catalog';
import { providerDisplayName } from '@electron/ipc/platform/auth';
import { buildAvailableModelGroups } from '@electron/ipc/agent/core/model-groups';

export interface ProviderHealthSnapshot {
  availableModelGroups: AvailableModelGroup[];
  providerHealth: ProviderHealthInfo[];
}

function buildGroupsFromInfra(
  infra: Awaited<ReturnType<typeof ensureInfra>>,
): AvailableModelGroup[] {
  const { modelRegistry } = infra;
  modelRegistry.authStorage.reload();
  return buildAvailableModelGroups(modelRegistry.getAvailable())
    .sort((a, b) => a.provider.localeCompare(b.provider))
    .map((group) => ({
      ...group,
      models: [...group.models].sort((a, b) => a.name.localeCompare(b.name) || a.modelId.localeCompare(b.modelId)),
    }));
}

function readConfiguredLocalProviderIds(): string[] {
  const modelsPath = path.join(SERO_AGENT_DIR, 'models.json');
  try {
    if (!existsSync(modelsPath)) return [];
    const raw = JSON.parse(readFileSync(modelsPath, 'utf8')) as LocalModelsConfig;
    const providers = raw?.providers && typeof raw.providers === 'object'
      ? Object.keys(raw.providers)
      : [];
    return providers.sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function buildMessage(status: ProviderHealthStatus, hasUsableModels: boolean): string {
  switch (status) {
    case 'healthy':
      return hasUsableModels ? 'Ready to use.' : 'No usable models detected yet.';
    case 'broken_expired':
      return 'Saved login looks expired or unavailable. Reconnect to use this provider.';
    case 'broken_invalid':
      return 'Saved API key may be invalid or no longer works. Reconnect to use this provider.';
    case 'env':
      return hasUsableModels
        ? 'Using environment-backed credentials.'
        : 'Environment-backed credentials were detected, but no usable models were found.';
    case 'local':
      return hasUsableModels
        ? 'Local or custom models are available.'
        : 'A local or custom provider is configured, but no usable models were detected.';
    case 'missing':
      return 'Not connected yet.';
    case 'unknown':
    default:
      return hasUsableModels ? 'Usable models are available.' : 'Provider health could not be determined.';
  }
}

function buildHealthInfo(args: {
  providerId: string;
  status: ProviderHealthStatus;
  usableModelIds: string[];
}): ProviderHealthInfo {
  const { providerId, status, usableModelIds } = args;
  const hasUsableModels = usableModelIds.length > 0;

  return {
    providerId,
    displayName: providerDisplayName(providerId),
    status,
    message: buildMessage(status, hasUsableModels),
    canReconnect: status === 'missing' || status === 'broken_expired' || status === 'broken_invalid',
    hasUsableModels,
    usableModelIds,
  };
}

function sortProviderHealth(providerHealth: ProviderHealthInfo[]): ProviderHealthInfo[] {
  return [...providerHealth].sort(
    (a, b) => a.displayName.localeCompare(b.displayName) || a.providerId.localeCompare(b.providerId),
  );
}

export async function getProviderHealthSnapshot(): Promise<ProviderHealthSnapshot> {
  const infra = await ensureInfra();
  const availableModelGroups = buildGroupsFromInfra(infra);
  const usableModelIdsByProvider = new Map<string, string[]>();
  for (const group of availableModelGroups) {
    usableModelIdsByProvider.set(
      group.provider,
      group.models.map((model) => model.modelId),
    );
  }

  infra.authStorage.reload();
  const providerHealth: ProviderHealthInfo[] = [];
  const knownProviders = new Set<string>();

  for (const provider of getOAuthProviderCatalog()) {
    knownProviders.add(provider.id);
    const credential = infra.authStorage.get(provider.id);
    const usableModelIds = usableModelIdsByProvider.get(provider.id) ?? [];
    const status: ProviderHealthStatus = usableModelIds.length > 0
      ? 'healthy'
      : credential?.type === 'oauth'
        ? 'broken_expired'
        : 'missing';
    providerHealth.push(buildHealthInfo({
      providerId: provider.id,
      status,
      usableModelIds,
    }));
  }

  for (const provider of getApiKeyProviderCatalog()) {
    knownProviders.add(provider.id);
    const credential = infra.authStorage.get(provider.id);
    const envKey = getProviderEnvApiKey(provider.id);
    const usableModelIds = usableModelIdsByProvider.get(provider.id) ?? [];

    let status: ProviderHealthStatus;
    if (usableModelIds.length > 0) {
      status = envKey && !credential ? 'env' : 'healthy';
    } else if (envKey && !credential) {
      status = 'env';
    } else if (credential?.type === 'api_key') {
      status = 'broken_invalid';
    } else {
      status = 'missing';
    }

    providerHealth.push(buildHealthInfo({
      providerId: provider.id,
      status,
      usableModelIds,
    }));
  }

  const localProviderIds = readConfiguredLocalProviderIds();
  for (const providerId of localProviderIds) {
    if (knownProviders.has(providerId)) continue;
    knownProviders.add(providerId);
    providerHealth.push(buildHealthInfo({
      providerId,
      status: 'local',
      usableModelIds: usableModelIdsByProvider.get(providerId) ?? [],
    }));
  }

  for (const group of availableModelGroups) {
    if (knownProviders.has(group.provider)) continue;
    providerHealth.push(buildHealthInfo({
      providerId: group.provider,
      status: 'unknown',
      usableModelIds: group.models.map((model) => model.modelId),
    }));
  }

  return {
    availableModelGroups,
    providerHealth: sortProviderHealth(providerHealth),
  };
}
