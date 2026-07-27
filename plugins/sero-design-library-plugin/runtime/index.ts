/**
 * Design Library background runtime.
 *
 * Long-running and resumable work lives here: Librarian analysis, variant
 * generation, asset generation, Gallery snapshots and export all continue
 * while the plugin UI is closed, and resume after a Sero restart.
 */

import type { AppRuntime, AppRuntimeContext, AppRuntimeModule } from '@sero-ai/common';
import * as esbuild from 'esbuild';
import { compile } from 'tailwindcss';

import { DesignLibraryCoordinator } from './coordinator';
import { createRuntimeHost } from './host';
import { createSecretResolver } from './secrets';
import { createDefaultRegistry } from './asset-generation/registry';
import type { ReactBuildDeps } from './preview/build';

/**
 * The React target compiles locally: esbuild bundles the generated TSX with
 * React from this plugin's own dependencies, and Tailwind's compiler produces
 * the utility CSS. Neither reaches the network.
 */
function reactToolchain(resolveDir: string): ReactBuildDeps {
  return {
    resolveDir,
    esbuild: esbuild as unknown as ReactBuildDeps['esbuild'],
    tailwind: { compile: compile as unknown as ReactBuildDeps['tailwind']['compile'] },
  };
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  const host = createRuntimeHost(ctx, createSecretResolver());
  const coordinator = new DesignLibraryCoordinator(host, {
    registry: createDefaultRegistry(),
    react: reactToolchain(new URL('..', import.meta.url).pathname),
  });

  return {
    start: () => coordinator.start(),
    handleStateChange: (state) => coordinator.handleStateChange(state),
    dispose: () => coordinator.dispose(),
  };
}

const runtimeModule: AppRuntimeModule = { createAppRuntime };
export default runtimeModule;
