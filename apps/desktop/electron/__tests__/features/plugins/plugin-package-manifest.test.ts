import { describe, expect, it } from 'vitest';

import {
  findUnsupportedDependencySpec,
  stripInstalledOnlyManifestFields,
} from '@electron/features/plugins/package-build';

describe('plugin package manifest helpers', () => {
  it('detects workspace and catalog dependency specs', () => {
    expect(findUnsupportedDependencySpec({
      dependencies: { react: '^19.1.1' },
      devDependencies: { '@sero-ai/app-runtime': 'workspace:*' },
    })).toBe('devDependencies.@sero-ai/app-runtime=workspace:*');

    expect(findUnsupportedDependencySpec({
      dependencies: { typebox: 'catalog:' },
    })).toBe('dependencies.typebox=catalog:');

    expect(findUnsupportedDependencySpec({
      dependencies: { react: '^19.1.1' },
      devDependencies: { vite: '^6.4.1' },
    })).toBeNull();
  });

  it('removes devPort from installed plugin manifests', () => {
    const result = stripInstalledOnlyManifestFields({
      sero: {
        app: {
          ui: './dist/ui/remoteEntry.js',
          runtime: './runtime/index.ts',
          devPort: 5174,
        },
      },
    });

    expect(result.sero?.app?.ui).toBe('./dist/ui/remoteEntry.js');
    expect(result.sero?.app?.runtime).toBe('./runtime/index.ts');
    expect(result.sero?.app).not.toHaveProperty('devPort');
  });
});
