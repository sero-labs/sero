import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

interface Manifest {
  name: string;
  pi: { extensions: string[] };
  sero: {
    app: Record<string, unknown>;
    plugin: Record<string, unknown>;
  };
  dependencies: Record<string, string>;
}

async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as Manifest;
}

describe('Design Library manifest', () => {
  it('declares a discoverable global app with a scoped UI and a background runtime', async () => {
    const manifest = await readManifest();

    expect(manifest.name).toBe('@sero-ai/plugin-design-library');
    expect(manifest.sero.app).toMatchObject({
      id: 'design-library',
      styleIsolation: 'scope',
      scope: 'global',
      component: 'DesignLibraryApp',
      devPort: 5190,
      runtime: './runtime/index.ts',
    });
    expect(manifest.pi.extensions).toEqual(['./extension/index.ts']);
  });

  it('declares exactly the host seams it uses', async () => {
    const manifest = await readManifest();

    expect(manifest.sero.plugin).toMatchObject({
      bridgeTools: false,
      preBuilt: false,
      runtimeAbi: 2,
    });
    expect(manifest.sero.plugin.requiredHostCapabilities).toEqual([
      'appAgent.invokeTool',
      'appRuntime.background',
    ]);
  });

  it('keeps the local preview toolchain external to the runtime bundle', async () => {
    const manifest = await readManifest();

    expect(manifest.sero.app.runtimeExternals).toEqual(['esbuild', 'tailwindcss']);
    expect(Object.keys(manifest.dependencies)).toEqual(
      expect.arrayContaining(['esbuild', 'tailwindcss']),
    );
  });
});
