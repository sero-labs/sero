import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { RtkToolchainResolution } from '@sero-ai/common';

import { type RtkStatusView } from '../shared/types';
import { ConfigStore } from './config';
import { computeRewrite } from './rewrite';
import { RtkResolver } from './rtk-client';
import { SessionState } from './state';
import { appendBlocks, textBlocks } from './result';
import { renderRewriteNotice } from './report';
import { optimizeResult } from './optimize-result';
import { seedMetricsFromHistory } from './history';
import { registerOptimizerTool } from './tool';
import { StatusStore } from './status';
import { isNestedCall } from './nested';

/** The host guarantees this reserved prefix reaches both hooks. */
export { NESTED_CALL_PREFIX } from './nested';

function toStatus(resolution: RtkToolchainResolution): RtkStatusView {
  if (resolution.state === 'available') return { state: 'available', version: resolution.version };
  if (resolution.state === 'installing') return { state: 'installing', reason: resolution.reason };
  return { state: 'failed', reason: resolution.reason };
}

function commandFromInput(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '';
  const command = (input as Record<string, unknown>).command;
  return typeof command === 'string' ? command : '';
}

export default function outputOptimizerExtension(pi: ExtensionAPI): void {
  const state = new SessionState();
  const resolver = new RtkResolver(pi.events, '', '');
  const configStore = new ConfigStore();
  const statusStore = new StatusStore();
  let rtkStatus: RtkStatusView = { state: 'unknown' };
  let ready: Promise<void> | null = null;

  /** Publish the session's accounting so the settings surface can read it. */
  const publishSavings = (): Promise<void> =>
    statusStore.publish({ savings: state.metrics.snapshot() });

  const ensureReady = (ctx: ExtensionContext): Promise<void> => {
    if (!ready) {
      const sessionId = ctx.sessionManager.getSessionId();
      state.setSessionId(sessionId);
      resolver.setIdentity(sessionId, ctx.cwd);
      ready = configStore.refresh().then(() => {
        // A resumed session, a replay, or a fork inherits its history here.
        const entries = typeof ctx.sessionManager.getEntries === 'function'
          ? ctx.sessionManager.getEntries()
          : [];
        seedMetricsFromHistory(state.metrics, state, entries);
      });
    }
    return ready;
  };

  /** Pick up a settings change made in another session before it takes effect. */
  const currentConfig = async (ctx: ExtensionContext) => {
    await ensureReady(ctx);
    return configStore.refresh();
  };

  pi.on('session_start', async (_event, ctx) => {
    await ensureReady(ctx);
  });

  // ── Rewriting ─────────────────────────────────────────────

  pi.on('tool_call', async (event, ctx) => {
    if (event.toolName !== 'bash') return undefined;
    if (isNestedCall(event.toolCallId)) return undefined;
    const config = await currentConfig(ctx);
    if (!config.enabled) return undefined;

    const command = commandFromInput(event.input);
    if (!command) return undefined;

    try {
      const resolution = await resolver.resolve();
      rtkStatus = toStatus(resolution);
      // The settings surface runs in another session and cannot probe RTK itself.
      await statusStore.publish({ rtk: rtkStatus });
      const outcome = await computeRewrite({ pi, command, resolution, config, platform: process.platform });
      if (outcome.state === 'rewritten') {
        state.recordRewrite(event.toolCallId, { requested: command, executed: outcome.executed });
        event.input.command = outcome.executed;
      } else {
        state.metrics.recordSkip();
      }
    } catch {
      // Fail open: the original command runs.
    }
    return undefined;
  });

  // ── Compaction ────────────────────────────────────────────

  pi.on('tool_result', async (event, ctx) => {
    if (event.toolName !== 'bash') return undefined;
    if (isNestedCall(event.toolCallId)) return undefined;
    const config = await currentConfig(ctx);

    const content = textBlocks(event.content);
    const rewrite = state.takeRewrite(event.toolCallId);

    // Replay guard: each history entry is counted once.
    if (!state.claimAccounting(event.toolCallId)) return undefined;
    if (!config.enabled) {
      const result = rewrite
        ? { content: appendBlocks(content, [renderRewriteNotice(rewrite.requested, rewrite.executed)]) }
        : undefined;
      await publishSavings();
      return result;
    }

    try {
      const result = await optimizeResult({
        content,
        details: event.details,
        requestedCommand: rewrite?.requested ?? commandFromInput(event.input),
        rewrite,
        config,
        metrics: state.metrics,
      });
      await publishSavings();
      return result;
    } catch {
      // Fail open: preserve the received payload, reports and error status.
      await publishSavings();
      return undefined;
    }
  });

  // ── Settings surface ──────────────────────────────────────

  registerOptimizerTool(pi, {
    // The settings tool reads the file, so it sees a change made in another
    // session before it merges its own write.
    loadConfig: () => configStore.reload(),
    setConfig: async (next) => {
      await configStore.save(next);
    },
    getStatus: async () => {
      // The chat session publishes accounting and RTK status here. Fall back to
      // this session's own values when nothing has been published yet.
      const persisted = await statusStore.read();
      return persisted ?? { savings: state.metrics.snapshot(), rtk: rtkStatus };
    },
    retryRtk: async () => {
      // Resolve again and report the current status, not a cached one.
      const resolution = await resolver.resolve();
      rtkStatus = toStatus(resolution);
      await statusStore.publish({ rtk: rtkStatus });
    },
  });
}
