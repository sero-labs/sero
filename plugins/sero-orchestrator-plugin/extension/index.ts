/**
 * Orchestrator extension — registers the `orchestrator` tool and the
 * `/orchestrator` slash command. Both are bridged through the CLI registry and
 * call the per-workspace coordinator via the shared registry.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { executeOrchestratorTool, OrchestratorToolParams, type OrchestratorToolParamsShape } from './tools';
import { registerOrchestratorCommand } from './commands';

export default function orchestratorExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'orchestrator',
    label: 'Orchestrator',
    description:
      'Manage durable Orchestrator loops (LLM-authored step plans). Actions: create, list, show, ' +
      'activate, disable, enable, run_next, run_again, revise, choose_recovery, set_step_model.',
    parameters: OrchestratorToolParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeOrchestratorTool(params as OrchestratorToolParamsShape, ctx?.cwd);
    },
    renderCall(args, theme) {
      let line = theme.fg('toolTitle', theme.bold('orchestrator '));
      line += theme.fg('muted', String(args.action ?? ''));
      if (args.loopId) line += ` ${theme.fg('accent', String(args.loopId))}`;
      return new Text(line, 0, 0);
    },
    renderResult(result, _options, theme) {
      const message = result.content[0]?.type === 'text' ? result.content[0].text : '';
      return new Text(
        message.startsWith('Error:')
          ? theme.fg('error', message)
          : theme.fg('success', '✓ ') + theme.fg('muted', message),
        0,
        0,
      );
    },
  });

  registerOrchestratorCommand(pi);
}
