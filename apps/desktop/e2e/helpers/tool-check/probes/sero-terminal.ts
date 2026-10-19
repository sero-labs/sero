import type { ToolProbe } from '../types';
import { expectText } from '../expect';
import { pageOf } from '../files';

const TERMINAL_ID = 'tool-check-terminal';

export const seroTerminalProbe: ToolProbe = {
  tool: 'sero terminal',
  steps: [{
    action: 'read',
    // Puts a line of output in a workspace terminal. The typed command does not contain the marker; only its output does.
    async setup(ctx) {
      await pageOf(ctx).evaluate(({ workspaceId, id }) => new Promise<void>((resolve, reject) => {
        let seen = '';
        const timer = window.setTimeout(() => reject(new Error(`the terminal never printed the marker: ${seen.slice(-300)}`)), 20_000);
        const stop = window.sero.terminal.onData((terminalId, data) => {
          if (terminalId !== id) return;
          seen += data;
          if (!seen.includes('tc-terminal-marker')) return;
          window.clearTimeout(timer);
          stop();
          resolve();
        });
        void window.sero.terminal.create(workspaceId, id, 120, 30)
          .then(() => window.sero.terminal.write(id, `node -e "console.log('tc-terminal-' + 'marker')"\r`));
      }), { workspaceId: ctx.workspaceId, id: TERMINAL_ID });
    },
    params: { argv: ['read', '50'] },
    expect: (result) => expectText(result, 'tc-terminal-marker'),
  }],
};
