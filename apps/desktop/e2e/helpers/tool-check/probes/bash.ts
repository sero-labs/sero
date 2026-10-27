import type { ToolProbe } from '../types';
import { expectError, expectOk } from '../expect';
import { expectFile } from '../files';

// `node -e` runs the same on every host shell and in the container image.
export const bashProbe: ToolProbe = {
  tool: 'bash',
  steps: [
    {
      action: null,
      params: { command: `node -e "require('fs').writeFileSync('tool-check-bash.txt', 'from bash'); console.log('bash-ok')"` },
      async expect(result, ctx) {
        expectOk(result);
        if (!result.text.includes('bash-ok')) throw new Error(`no output: ${result.text}`);
        await expectFile(ctx, 'tool-check-bash.txt', 'from bash');
      },
    },
    {
      // A failed command is an error result that carries the exit code.
      action: null,
      params: { command: 'node -e "process.exit(3)"' },
      expect(result) {
        expectError(result, 'exited with code 3');
      },
    },
  ],
};
