import type { SeroAppManifest } from '@/types/ipc';

export function createManifest(
  id: string,
  overrides: Partial<SeroAppManifest> = {},
): SeroAppManifest {
  return {
    id,
    name: id,
    description: null,
    version: '1.0.0',
    packageName: `@sero/${id}`,
    icon: 'box',
    stateFile: `.sero/apps/${id}/state.json`,
    scope: 'workspace',
    globalStatePath: null,
    uiEntry: null,
    runtimeEntry: `/tmp/${id}/runtime/index.js`,
    component: null,
    devPort: undefined,
    remoteEntryOverride: null,
    packagePath: `/tmp/${id}`,
    isPlugin: true,
    plugin: {
      category: 'utilities',
      tags: [id],
      requiredHostCapabilities: ['appRuntime.background'],
    },
    hostCompatibility: {
      supported: true,
      hostVersion: '0.1.0',
      issues: [],
    },
    contributions: { components: [], controls: [] },
    contributionDiagnostics: [],
    ...overrides,
  };
}
