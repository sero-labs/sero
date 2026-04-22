import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { PluginMeta } from '@sero-ai/common';

import {
  evaluatePluginCompatibility,
  type SeroHostCompatibilityContext,
} from '@electron/features/plugins/compatibility';

function makeContext(overrides?: Partial<SeroHostCompatibilityContext>): SeroHostCompatibilityContext {
  return {
    hostVersion: overrides?.hostVersion ?? '0.1.0',
    capabilities: overrides?.capabilities ?? new Set(['appAgent.invokeTool', 'tool.cli', 'appRuntime.background']),
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
