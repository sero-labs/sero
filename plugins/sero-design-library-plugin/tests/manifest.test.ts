import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Design Library manifest', () => {
  it('declares a discoverable global, scoped UI without production host capabilities', async () => {
    const packageUrl = new URL('../package.json', import.meta.url);
    const manifest = JSON.parse(await readFile(packageUrl, 'utf8')) as {
      name: string;
      sero: {
        app: Record<string, unknown>;
        plugin: Record<string, unknown>;
      };
    };

    expect(manifest.name).toBe('@sero-ai/plugin-design-library');
    expect(manifest.sero.app).toMatchObject({
      id: 'design-library',
      styleIsolation: 'scope',
      scope: 'global',
      component: 'DesignLibraryApp',
      devPort: 5190,
    });
    expect(manifest.sero.plugin).toMatchObject({
      bridgeTools: false,
      preBuilt: false,
    });
    expect(manifest.sero.plugin).not.toHaveProperty('requiredHostCapabilities');
  });
});
