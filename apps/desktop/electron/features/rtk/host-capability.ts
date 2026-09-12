import type { EventBus } from '@earendil-works/pi-coding-agent';import {
  RTK_TOOLCHAIN_EVENT,
  type RtkToolchainRequest,
  type RtkToolchainResolution,
} from '@sero-ai/common';
import { createHostToolResolver } from '@electron/features/workspace/runtime/toolchains/host-tool-resolver';
import { loadBundledToolchainManifest } from '@electron/features/workspace/runtime/toolchains/manifest';
import { RtkToolchainService, type RtkRuntimePort } from './service';

export interface RtkHostCapabilityContext {
  sessionId: string;
  runtime: RtkRuntimePort;
}

/** The part of the resolution service the EventBus handler depends on. */
export interface RtkResolutionSource {
  resolve(input: { sessionId: string; runtime: RtkRuntimePort }): Promise<RtkToolchainResolution>;
}

/** One resolution service per process; its probe cache is keyed by container identity and pin. */
let sharedService: RtkToolchainService | null = null;

function getRtkToolchainService(): RtkToolchainService {
  if (!sharedService) {
    sharedService = new RtkToolchainService({
      manifest: loadBundledToolchainManifest(),
      tools: createHostToolResolver(),
    });
  }
  return sharedService;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Answer extension requests for the verified RTK executable.
 *
 * The bus belongs to one session, so a request that names another session is
 * refused instead of creating that session's state. Neither an unavailable nor
 * a failed answer rejects the caller: rewriting is disabled and the session
 * continues.
 */
export function registerRtkHostCapability(
  events: EventBus,
  context: RtkHostCapabilityContext,
  source: RtkResolutionSource = getRtkToolchainService(),
): void {
  events.on(RTK_TOOLCHAIN_EVENT, (data) => {
    const request = data as RtkToolchainRequest | undefined;
    if (!request || typeof request.accept !== 'function' || typeof request.resolve !== 'function') return;
    request.accept();

    if (!request.sessionId || request.sessionId !== context.sessionId) {
      request.resolve({
        state: 'failed',
        reason: 'RTK resolution request must name the session that owns this extension host.',
      });
      return;
    }

    void source.resolve({ sessionId: context.sessionId, runtime: context.runtime }).then(
      (result) => request.resolve(result),
      (error: unknown) => request.resolve({ state: 'failed', reason: errorMessage(error) }),
    );
  });
}
