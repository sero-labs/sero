import type { EventBus } from '@earendil-works/pi-coding-agent';
import {
  createIsolatedCompletionService,
  registerIsolatedCompletionHost,
} from '@sero-ai/extension-runtime';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { ensureAiInfra } from './ai-infra';

/** Register Sero's shared runtime behind the narrow completion event boundary. */
export function registerSharedIsolatedCompletionHost(events: EventBus): void {
  registerIsolatedCompletionHost(events, async (request) => {
    const { modelRuntime } = await ensureAiInfra();
    return createIsolatedCompletionService({
      agentDir: SERO_AGENT_DIR,
      modelRuntime,
    })(request);
  });
}
