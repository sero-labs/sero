/**
 * The bundled Architect plugin manifest, read the way the host reads it at
 * startup: this is what puts the app in the sidebar and lets the
 * persistent-session gate find it.
 */

import path from 'path';
import { describe, expect, it } from 'vitest';
import { SERO_HOST_CAPABILITIES } from '@sero-ai/common';
import { discoverBuiltinPluginPaths } from '@electron/platform/protocols/builtin-resources';
import { readAppManifestFromPackagePath } from '@electron/features/apps/discovery';
import { PERSISTENT_SESSION_BUILTIN_APPS } from '@electron/features/apps/runtime/capabilities/persistent-sessions/builtin-gate';

describe('bundled Architect plugin', () => {
  it('is discovered as a built-in and resolves to a sidebar app with a runtime', async () => {
    const bundled = discoverBuiltinPluginPaths().find((p) => path.basename(p) === 'sero-architect-plugin');
    expect(bundled).toBeDefined();
    expect(path.basename(bundled!)).toBe(PERSISTENT_SESSION_BUILTIN_APPS.architect);

    const manifest = await readAppManifestFromPackagePath(bundled!);
    expect(manifest).toMatchObject({
      id: 'architect',
      name: 'Architect',
      scope: 'global',
      component: 'ArchitectApp',
      isPlugin: true,
    });
    expect(manifest?.uiEntry).toBeTruthy();
    expect(manifest?.runtimeEntry).toBeTruthy();
    expect(manifest?.globalStatePath).toMatch(/apps\/architect\/state\.json$/);
    expect(manifest?.hostCompatibility?.supported).toBe(true);
    expect(manifest?.hostCompatibility?.issues).toEqual([]);
    // Every declared capability is one this host build knows.
    for (const capability of manifest?.plugin?.requiredHostCapabilities ?? []) {
      expect(SERO_HOST_CAPABILITIES).toContain(capability);
    }
    expect(manifest?.contributions.components.map((c) => c.extensionPoint)).toEqual(['ui.dashboard.widget']);
  });
});
