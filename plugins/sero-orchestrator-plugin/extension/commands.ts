// The `/orchestrator` slash command — a chat convenience that forwards a
// subcommand line straight to the workspace coordinator (D-01) and reports the
// plain-English outcome via the UI. Its name matches the bridged `orchestrator`
// tool, so Sero skips bridging it into the CLI (no `sero orchestrator` shadow);
// it stays available only as a slash command in the chat input.

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import {
  HELP,
  actionFromCli,
  formatResult,
  resolveCoordinator,
  tokenize,
} from './tools';

const NOT_READY =
  'Orchestrator is not running for this workspace. Open the workspace in Sero and try again.';

export function registerOrchestratorCommand(pi: ExtensionAPI): void {
  pi.registerCommand('orchestrator', {
    description:
      'Manage orchestrator goals: /orchestrator list | show <id> | pause <id> | resume <id> | stop <id> | run-next <id>',
    handler: async (args, ctx) => {
      const coordinator = resolveCoordinator(ctx.cwd);
      if (!coordinator) {
        ctx.ui.notify(NOT_READY, 'warning');
        return;
      }
      const action = actionFromCli(tokenize(args));
      if ('error' in action) {
        // Help/usage text is informational, not a failure.
        const isHelp = action.error === HELP || action.error.endsWith(HELP);
        ctx.ui.notify(action.error, isHelp ? 'info' : 'error');
        return;
      }
      const result = await coordinator.requestAction(action);
      ctx.ui.notify(formatResult(result), result.ok ? 'info' : 'error');
    },
  });
}
