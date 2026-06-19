import type { AppRuntime, AppRuntimeContext, AppRuntimeModule } from '@sero-ai/common';
import { GraphifyIndexer } from './indexer';
import { createIndexerHost } from './host-adapter';

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  const { host } = createIndexerHost(ctx);
  const indexer = new GraphifyIndexer(host);
  return {
    start: () => indexer.start(),
    handleStateChange: (state) => indexer.handleStateChange(state),
    dispose: () => indexer.dispose(),
  };
}

const runtimeModule: AppRuntimeModule = { createAppRuntime };
export default runtimeModule;
