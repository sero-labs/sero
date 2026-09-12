import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { RtkToolchainResolution } from '@sero-ai/common';

import {
  defaultOptimizerConfig,
  type OutputOptimizerConfig,
  type RtkStatusView,
} from '../shared/types';
import { loadConfig, normalizeConfig, saveConfig } from './config';
import { computeRewrite } from './rewrite';
import { RtkResolver } from './rtk-client';
import { SessionState } from './state';
import { appendBlocks, textBlocks } from './result';
import { renderRewriteNotice } from './report';
import { optimizeResult } from './optimize-result';
import { seedMetricsFromHistory } from './history';
import { registerOptimizerTool } from './tool';
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
  let config: OutputOptimizerConfig = defaultOptimizerConfig();
  let rtkStatus: RtkStatusView = { state: 'unknown' };
  let ready: Promise<void> | null = null;

  const ensureReady = (ctx: ExtensionContext): Promise<void> => {
    if (!ready) {
      const sessionId = ctx.sessionManager.getSessionId();
      state.setSessionId(sessionId);
      resolver.setIdentity(sessionId, ctx.cwd);
      ready = loadConfig().then((loaded) => {
        config = loaded;
        // A resumed session, a replay, or a fork inherits its history here.
        const entries = typeof ctx.sessionManager.getEntries === 'function'
          ? ctx.sessionManager.getEntries()
          : [];
        seedMetricsFromHistory(state.metrics, state, entries);
      });
    }
    return ready;
  };

  pi.on('session_start', async (_event, ctx) => {
    await ensureReady(ctx);
  });

  // ── Rewriting ─────────────────────────────────────────────

  pi.on('tool_call', async (event, ctx) => {
    if (event.toolName !== 'bash') return undefined;
    if (isNestedCall(event.toolCallId)) return undefined;
    await ensureReady(ctx);
    if (!config.enabled) return undefined;

    const command = commandFromInput(event.input);
    if (!command) return undefined;

    try {
      const resolution = await resolver.resolve();
      rtkStatus = toStatus(resolution);
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
    await ensureReady(ctx);

    const content = textBlocks(event.content);
    const rewrite = state.takeRewrite(event.toolCallId);

    // Replay guard: each history entry is counted once.
    if (!state.claimAccounting(event.toolCallId)) return undefined;
    if (!config.enabled) {
      return rewrite
        ? { content: appendBlocks(content, [renderRewriteNotice(rewrite.requested, rewrite.executed)]) }
        : undefined;
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
      return result;
    } catch {
      // Fail open: preserve the received payload, reports and error status.
      return undefined;
    }
  });

  // ── Settings surface ──────────────────────────────────────

  registerOptimizerTool(pi, {
    getConfig: () => config,
    setConfig: async (next) => {
      config = normalizeConfig(next);
      await saveConfig(config);
    },
    getSavings: () => state.metrics.snapshot(),
    getRtkStatus: () => rtkStatus,
    retryRtk: () => resolver.invalidate(),
  });
}
