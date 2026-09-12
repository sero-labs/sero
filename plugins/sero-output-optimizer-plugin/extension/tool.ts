import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { StringEnum } from '@earendil-works/pi-ai';
import { Type } from 'typebox';

import {
  REWRITE_CLASSES,  type OutputOptimizerConfig,
  type OutputOptimizerState,
  type RewriteClass,
  type RtkStatusView,
  type SessionSavings,
} from '../shared/types';

/**
 * The bridged tool the plugin UI uses to read and change settings.
 *
 * The extension owns config, metrics and RTK status; the UI never touches the
 * config file directly.
 */

export interface OptimizerToolContext {
  getConfig(): OutputOptimizerConfig;
  setConfig(next: OutputOptimizerConfig): Promise<void>;
  getSavings(): SessionSavings;
  getRtkStatus(): RtkStatusView;
  retryRtk(): void;
}

const ACTIONS = ['state', 'set', 'retry'] as const;

const OptimizerParams = Type.Object({
  action: StringEnum(ACTIONS, { description: 'state reads settings, set writes them, retry clears the RTK cache' }),
  enabled: Type.Optional(Type.Boolean({ description: 'Enable or disable output optimisation' })),
  notices: Type.Optional(Type.Boolean({ description: 'Show optimisation notices on results' })),
  rewriteClasses: Type.Optional(Type.Record(Type.String(), Type.Boolean(), {
    description: 'Per-class rewrite switches',
  })),
});

function mergeConfig(
  current: OutputOptimizerConfig,
  input: { enabled?: boolean; notices?: boolean; rewriteClasses?: Record<string, boolean> },
): OutputOptimizerConfig {
  const rewriteClasses = { ...current.rewriteClasses };
  for (const rewriteClass of REWRITE_CLASSES) {
    const value = input.rewriteClasses?.[rewriteClass];
    if (typeof value === 'boolean') rewriteClasses[rewriteClass as RewriteClass] = value;
  }
  return {
    ...current,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    notices: typeof input.notices === 'boolean' ? input.notices : current.notices,
    rewriteClasses,
  };
}

function describe(state: OutputOptimizerState): string {
  const lines = [
    `Output optimisation: ${state.config.enabled ? 'enabled' : 'disabled'}`,
    `Notices: ${state.config.notices ? 'on' : 'off'}`,
    `RTK: ${state.rtk.state}${state.rtk.version ? ` ${state.rtk.version}` : ''}`,
  ];
  if (state.rtk.reason) lines.push(`RTK detail: ${state.rtk.reason}`);
  for (const rewriteClass of REWRITE_CLASSES) {
    lines.push(`  ${rewriteClass}: ${state.config.rewriteClasses[rewriteClass] ? 'on' : 'off'}`);
  }
  lines.push(
    `Measured calls: ${state.savings.measuredCalls}, unmeasured: ${state.savings.unmeasuredCalls}`,
    `Input bytes: ${state.savings.inputBytes}, compacted bytes: ${state.savings.compactedBytes}`,
  );
  return lines.join('\n');
}

export function registerOptimizerTool(pi: ExtensionAPI, context: OptimizerToolContext): void {
  pi.registerTool({
    name: 'output_optimizer',
    label: 'Output optimizer',
    description:
      'Read or change shell output optimisation settings, and read session compaction accounting. ' +
      'Actions: state (read settings, RTK status and session savings), set (write enabled, notices or per-class switches), retry (clear the cached RTK resolution).',
    parameters: OptimizerParams,
    async execute(_toolCallId, params) {
      if (params.action === 'retry') {
        context.retryRtk();
      }
      if (params.action === 'set') {
        await context.setConfig(mergeConfig(context.getConfig(), params));
      }
      const state: OutputOptimizerState = {
        config: context.getConfig(),
        savings: context.getSavings(),
        rtk: context.getRtkStatus(),
      };
      return {
        content: [{ type: 'text' as const, text: describe(state) }],
        details: state,
      };
    },
  });
}
