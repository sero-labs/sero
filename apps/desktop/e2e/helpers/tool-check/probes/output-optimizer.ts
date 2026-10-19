import fs from 'node:fs/promises';
import path from 'node:path';
import { expectContains, must, profileDir, readJson } from './cron-memory-support';
import type { StepContext, ToolProbe } from '../types';

/** Both files live in `<profile>/state/output-optimizer/` (extension/paths.ts, extension/status.ts). */
async function stateDir(ctx: StepContext): Promise<string> {
  return path.join(await profileDir(ctx), 'state', 'output-optimizer');
}

interface ConfigFile {
  enabled: boolean;
  notices: boolean;
  rewriteClasses: Record<string, boolean>;
}

async function configFile(ctx: StepContext): Promise<ConfigFile> {
  const config = await readJson<ConfigFile>(path.join(await stateDir(ctx), 'config.json'));
  must(config, 'config.json is missing');
  return config;
}

export const outputOptimizerProbe: ToolProbe = {
  tool: 'output_optimizer',
  steps: [
    {
      // A seeded config that differs from the defaults, so the output proves the tool read the file.
      action: 'state',
      setup: async (ctx) => {
        const dir = await stateDir(ctx);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'config.json'), `${JSON.stringify({ version: 1, enabled: false, notices: false, rewriteClasses: { fileReads: false } }, null, 2)}\n`);
      },
      params: { action: 'state' },
      expect(result) {
        // tool.ts describe(): "Output optimisation: ...", "Notices: ...", "RTK: ...", "  <class>: on|off", "Measured calls: ..."
        expectContains(result, 'Output optimisation: disabled', 'Notices: off', '  fileReads: off', '  git: on', 'Measured calls: ', 'Input bytes: ');
        must(/^RTK: (unknown|available|installing|failed)/m.test(result.text), `no RTK line in: ${result.text}`);
      },
    },
    {
      // Resolving RTK asks the host, which may install it on first use; any answer is a real answer.
      action: 'retry',
      params: { action: 'retry' },
      timeoutMs: 60_000,
      async expect(result, ctx) {
        expectContains(result, 'Output optimisation: ');
        const reported = /^RTK: (available|installing|failed)/m.exec(result.text)?.[1];
        must(reported, `RTK was not resolved by retry: ${result.text}`);
        const status = await readJson<{ rtk: { state: string } }>(path.join(await stateDir(ctx), 'status.json'));
        must(status?.rtk.state === reported, `status.json holds ${JSON.stringify(status)}, the tool reported ${reported}`);
      },
    },
    {
      action: 'set',
      params: { action: 'set', enabled: true, notices: true, rewriteClasses: { fileReads: true, git: false } },
      async expect(result, ctx) {
        expectContains(result, 'Output optimisation: enabled', 'Notices: on', '  fileReads: on', '  git: off', '  tests: on');
        const config = await configFile(ctx);
        must(config.enabled === true && config.notices === true, `config.json was not changed: ${JSON.stringify(config)}`);
        must(config.rewriteClasses.git === false && config.rewriteClasses.fileReads === true, `rewriteClasses were not changed: ${JSON.stringify(config)}`);
      },
    },
    {
      // Turns optimisation off again, so no later bash call in this run is rewritten.
      action: 'set',
      params: { action: 'set', enabled: false, rewriteClasses: { git: true } },
      async expect(result, ctx) {
        expectContains(result, 'Output optimisation: disabled', '  git: on');
        const config = await configFile(ctx);
        must(config.enabled === false && config.rewriteClasses.git === true, `config.json was not restored: ${JSON.stringify(config)}`);
      },
    },
    {
      action: 'state',
      params: { action: 'state' },
      expect: (result) => expectContains(result, 'Output optimisation: disabled', 'Notices: on', '  fileReads: on'),
    },
  ],
};
