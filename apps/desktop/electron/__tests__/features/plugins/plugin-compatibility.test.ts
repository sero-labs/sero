import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  SERO_HOST_CAPABILITIES,
  SERO_PLUGIN_RUNTIME_ABI,
  type PluginMeta,
} from '@sero-ai/common';

import {
  evaluatePluginCompatibility,
  type SeroHostCompatibilityContext,
} from '@electron/features/plugins/compatibility';
import { extractPluginCompatibilityRequirements } from '@electron/features/apps/discovery/plugin-meta';

function makeContext(overrides?: Partial<SeroHostCompatibilityContext>): SeroHostCompatibilityContext {
  return {
    hostVersion: overrides?.hostVersion ?? '0.1.0',
    capabilities: overrides?.capabilities ?? new Set(SERO_HOST_CAPABILITIES),
  };
}

describe('plugin compatibility', () => {
  it('falls back to the desktop package version when Electron reports 0.0.0', async () => {
    vi.resetModules();
    vi.doMock('electron', () => ({
      app: {
        getVersion: () => '0.0.0',
      },
    }));

    const desktopPackageJson = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../../package.json'), 'utf8'),
    ) as { version: string };

    const { getSeroHostCompatibilityContext } = await import('@electron/features/plugins/compatibility');
    expect(getSeroHostCompatibilityContext().hostVersion).toBe(desktopPackageJson.version);

    vi.doUnmock('electron');
    vi.resetModules();
  });

  it('falls back to the desktop package version when Electron reports its own runtime version', async () => {
    vi.resetModules();

    const originalVersions = process.versions;
    Object.defineProperty(process, 'versions', {
      value: {
        ...process.versions,
        electron: '33.4.11',
      },
      configurable: true,
    });

    vi.doMock('electron', () => ({
      app: {
        getVersion: () => '33.4.11',
        getAppPath: () => path.resolve(__dirname, '../../../dist/electron'),
      },
    }));

    const desktopPackageJson = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../../package.json'), 'utf8'),
    ) as { version: string };

    try {
      const { getSeroHostCompatibilityContext } = await import('@electron/features/plugins/compatibility');
      expect(getSeroHostCompatibilityContext().hostVersion).toBe(desktopPackageJson.version);
    } finally {
      Object.defineProperty(process, 'versions', {
        value: originalVersions,
        configurable: true,
      });
      vi.doUnmock('electron');
      vi.resetModules();
    }
  });

  it('accepts plugins whose version and capability requirements are satisfied', () => {
    const plugin: PluginMeta = {
      category: 'integrations',
      tags: ['google'],
      minSeroVersion: '0.1.0',
      requiredHostCapabilities: ['appAgent.invokeTool', 'tool.cli', 'appRuntime.background'],
    };

    expect(evaluatePluginCompatibility(plugin, makeContext())).toEqual({
      supported: true,
      hostVersion: '0.1.0',
      issues: [],
    });
  });

  it('accepts an external plugin that requires the Admin model-settings host point', () => {
    const compatibility = evaluatePluginCompatibility({
      requiredHostCapabilities: ['ui.admin.model-settings'],
    }, makeContext());

    expect(SERO_HOST_CAPABILITIES).toContain('ui.admin.model-settings');
    expect(compatibility).toEqual({
      supported: true,
      hostVersion: '0.1.0',
      issues: [],
    });
  });

  it('accepts a UI plugin built against the current federated-UI ABI', () => {
    const compatibility = evaluatePluginCompatibility(
      { minSeroVersion: '0.1.0', federatedUi: { runtimeAbi: SERO_PLUGIN_RUNTIME_ABI } },
      makeContext(),
    );

    expect(compatibility?.supported).toBe(true);
  });

  it('fails closed when a UI plugin predates the federated-UI ABI', () => {
    const compatibility = evaluatePluginCompatibility(
      { minSeroVersion: '0.1.0', federatedUi: { runtimeAbi: undefined } },
      makeContext(),
    );

    expect(compatibility?.supported).toBe(false);
    expect(compatibility?.issues).toContainEqual(expect.objectContaining({
      kind: 'pluginRuntimeAbi',
      expected: String(SERO_PLUGIN_RUNTIME_ABI),
      actual: 'none',
    }));
  });

  it('fails closed when a UI plugin was built against a different federated-UI ABI', () => {
    const compatibility = evaluatePluginCompatibility(
      { federatedUi: { runtimeAbi: SERO_PLUGIN_RUNTIME_ABI + 1 } },
      makeContext(),
    );

    expect(compatibility?.supported).toBe(false);
    expect(compatibility?.issues).toContainEqual(expect.objectContaining({
      kind: 'pluginRuntimeAbi',
      actual: String(SERO_PLUGIN_RUNTIME_ABI + 1),
    }));
  });

  // The contract every caller depends on: `sero.plugin` is optional, so an
  // absent or malformed block must still yield an ABI requirement for a plugin
  // that ships a UI. Returning null here is what let unmarked bundles mount.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'nonsense'],
    ['an array', []],
  ])('derives an ABI requirement for a federated UI whose sero.plugin is %s', (_label, plugin) => {
    const requirements = extractPluginCompatibilityRequirements(plugin, {
      expectsFederatedUi: true,
    });

    expect(requirements?.federatedUi).toBeDefined();
    expect(requirements?.federatedUi?.runtimeAbi).toBeUndefined();
    expect(evaluatePluginCompatibility(requirements, makeContext())?.supported).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('derives no requirement for a UI-less plugin whose sero.plugin is %s', (_label, plugin) => {
    expect(
      extractPluginCompatibilityRequirements(plugin, { expectsFederatedUi: false }),
    ).toBeNull();
  });

  it('exempts plugins with no federated UI from the ABI check', () => {
    const compatibility = evaluatePluginCompatibility(
      { minSeroVersion: '0.1.0' },
      makeContext(),
    );

    expect(compatibility?.supported).toBe(true);
  });

  it('fails closed when a plugin requires a newer Sero version', () => {
    const plugin: PluginMeta = {
      category: 'integrations',
      tags: ['google'],
      minSeroVersion: '0.2.0',
    };

    const compatibility = evaluatePluginCompatibility(plugin, makeContext({ hostVersion: '0.1.0' }));

    expect(compatibility?.supported).toBe(false);
    expect(compatibility?.issues).toContainEqual(expect.objectContaining({
      kind: 'minSeroVersion',
      expected: '0.2.0',
      actual: '0.1.0',
    }));
  });

  it('fails closed when a required host capability is missing', () => {
    const plugin: PluginMeta = {
      category: 'integrations',
      tags: ['google'],
      requiredHostCapabilities: ['appAgent.invokeTool', 'tool.cli'],
    };

    const compatibility = evaluatePluginCompatibility(
      plugin,
      makeContext({ capabilities: new Set(['appAgent.invokeTool']) }),
    );

    expect(compatibility?.supported).toBe(false);
    expect(compatibility?.issues).toContainEqual(expect.objectContaining({
      kind: 'requiredHostCapability',
      capability: 'tool.cli',
    }));
  });

  it('fails closed for forward host capabilities the current build does not recognize', () => {
    const compatibility = evaluatePluginCompatibility(
      {
        minSeroVersion: '0.1.0',
        requiredHostCapabilities: ['future.host.capability'],
      },
      makeContext(),
    );

    expect(compatibility?.supported).toBe(false);
    expect(compatibility?.issues).toContainEqual(expect.objectContaining({
      kind: 'requiredHostCapability',
      capability: 'future.host.capability',
    }));
  });
});
