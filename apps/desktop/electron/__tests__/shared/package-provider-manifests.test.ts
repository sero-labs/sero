import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  builtinPackagePaths: ['/builtin/provider-package'],
  packageJsonByPath: new Map<string, string>(),
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/agent',
}));

vi.mock('@electron/platform/protocols/builtin-resources', () => ({
  discoverBuiltinPackagePaths: () => state.builtinPackagePaths,
  discoverBuiltinPluginPaths: () => [],
}));

vi.mock('@electron/shared/settings/settings-helpers', () => ({
  readSettingsResult: () => ({ ok: true as const, settings: {} }),
}));

vi.mock('fs', () => ({
  existsSync: (targetPath: string) => {
    if (state.packageJsonByPath.has(targetPath)) return true;
    if (targetPath === '/agent/packages' || targetPath === '/agent/extensions') return false;
    if (targetPath === '/builtin/provider-package/package.json') return state.packageJsonByPath.has(targetPath);
    return false;
  },
  readdirSync: () => [],
  readFileSync: (targetPath: string) => {
    const value = state.packageJsonByPath.get(targetPath);
    if (value === undefined) {
      throw new Error(`Unexpected read: ${targetPath}`);
    }
    return value;
  },
}));

import {
  getPackageApiKeyProviders,
  getPackageProviderEnvVar,
  getPackageProviderManifest,
  invalidatePackageProviderManifestCache,
} from '@electron/shared/providers/package-provider-manifests';

function setProviderManifest(providerName: string, envVar = 'TEST_API_KEY'): void {
  state.packageJsonByPath.set(
    '/builtin/provider-package/package.json',
    JSON.stringify({
      sero: {
        providers: [
          {
            id: 'test-provider',
            name: providerName,
            auth: { type: 'apiKey', envVar },
            defaults: { HIGH: 'model-pro' },
          },
        ],
      },
    }),
  );
}

describe('package provider manifest cache', () => {
  beforeEach(() => {
    state.packageJsonByPath.clear();
    setProviderManifest('Test Provider');
    invalidatePackageProviderManifestCache();
  });

  it('reads provider manifests from builtin packages', () => {
    expect(getPackageProviderManifest('test-provider')).toEqual({
      id: 'test-provider',
      name: 'Test Provider',
      auth: { type: 'apiKey', envVar: 'TEST_API_KEY' },
      defaults: { HIGH: 'model-pro' },
      logo: undefined,
    });

    expect(getPackageApiKeyProviders()).toEqual([
      { id: 'test-provider', name: 'Test Provider' },
    ]);
    expect(getPackageProviderEnvVar('test-provider')).toBe('TEST_API_KEY');
  });

  it('drops stale cached results after explicit invalidation', () => {
    expect(getPackageProviderManifest('test-provider')?.name).toBe('Test Provider');

    setProviderManifest('Updated Provider', 'UPDATED_API_KEY');
    expect(getPackageProviderManifest('test-provider')?.name).toBe('Test Provider');

    invalidatePackageProviderManifestCache();

    expect(getPackageProviderManifest('test-provider')).toEqual({
      id: 'test-provider',
      name: 'Updated Provider',
      auth: { type: 'apiKey', envVar: 'UPDATED_API_KEY' },
      defaults: { HIGH: 'model-pro' },
      logo: undefined,
    });
  });
});
