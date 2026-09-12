/**
 * Loads Sero's host file-tool factory inside the eval runtime.
 *
 * The factory is plain TypeScript under `apps/desktop/electron`. The eval
 * tsconfig (`eval/tsconfig.json`, wired through `TSX_TSCONFIG_PATH`) resolves
 * the `@electron/*` imports. The import may arrive as CommonJS interop, so read
 * the factory from either the namespace or its `default` export.
 */

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

interface HostFactoryModule {
  createHostCodingTools?: (basedir: string) => ToolDefinition[];
  default?: { createHostCodingTools?: (basedir: string) => ToolDefinition[] };
}

export async function loadRuntimeHostTools(basedir: string): Promise<ToolDefinition[]> {
  const module = (await import(
    '../apps/desktop/electron/features/container/tools/tools-host'
  )) as HostFactoryModule;
  const factory = module.createHostCodingTools ?? module.default?.createHostCodingTools;
  if (typeof factory !== 'function') {
    throw new Error('Sero host file-tool factory is unavailable in the eval runtime.');
  }
  return factory(basedir);
}
