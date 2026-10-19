/**
 * The `usage` tool has its own `sero usage <subcommand> [period] [n]` command
 * line (plugins/sero-usage-plugin/extension/tools.ts, `cli.execute`), which
 * reads its arguments by position and ignores `--name=value` flags. So each
 * step passes `{ argv }`, the tokens after `usage`, as a `sero <command>` step
 * does.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { expectError, expectText } from '../expect';
import type { StepContext, ToolProbe } from '../types';
import { expectContains, must, profileDir, readJson } from './cron-memory-support';

const PROVIDER = 'tc-usage-provider';
const SESSION_NAME = 'tc-usage-session';

interface UsageStateFile {
  settings: { refreshIntervalMinutes: number };
  lastRefreshedAt: number | null;
  periods: Record<'today' | 'allTime', {
    providers: Array<{ provider: string; cost: number; tokens: { total: number } }>;
    topSessions: Array<{ label: string; cost: number }>;
  }>;
}

/** `<profile>/apps/usage/state.json`, from plugins/sero-usage-plugin/extension/state-io.ts. */
async function usageState(ctx: StepContext): Promise<UsageStateFile> {
  const state = await readJson<UsageStateFile>(path.join(await profileDir(ctx), 'apps', 'usage', 'state.json'));
  must(state, 'the usage state file is missing');
  return state;
}

/** Sessions are scanned from `<profile>/agent/sessions/**.jsonl`. This one is billed 1.25 for 1500 tokens. */
async function seedSession(ctx: StepContext): Promise<void> {
  const dir = path.join(await profileDir(ctx), 'agent', 'sessions', 'tc-usage');
  await fs.mkdir(dir, { recursive: true });
  const now = Date.now();
  const stamp = new Date(now).toISOString();
  const lines = [
    { type: 'session', id: 'tc-usage-session-id', cwd: ctx.workspacePath, timestamp: stamp },
    { type: 'session_info', name: SESSION_NAME },
    { type: 'message', timestamp: stamp, message: { role: 'user', content: 'tc-usage seed prompt', timestamp: now } },
    {
      type: 'message',
      timestamp: stamp,
      message: {
        role: 'assistant', provider: PROVIDER, model: 'tc-usage-model', timestamp: now, content: [{ type: 'text', text: 'ok' }],
        usage: { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, cost: { total: 1.25 } },
      },
    },
  ];
  await fs.writeFile(path.join(dir, 'session.jsonl'), `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
}

const describeInterval = (minutes: number): string => (minutes <= 0 ? 'manual only' : minutes < 60 ? `every ${minutes} minutes` : `every ${minutes / 60} hours`);

export const usageProbe: ToolProbe = {
  tool: 'usage',
  steps: [
    {
      action: 'refresh',
      setup: seedSession,
      params: { argv: ['refresh'] },
      async expect(result, ctx) {
        // refresh.ts summarizeRefresh: `Scanned ${files} session files (...) in ${ms}ms. All time: ...`
        expectText(result, ' session files (');
        must(/^Scanned [1-9]\d* session files/.test(result.text), `unexpected refresh text: ${result.text}`);
        const state = await usageState(ctx);
        must(state.lastRefreshedAt && Date.now() - state.lastRefreshedAt < 300_000, 'the state file has no fresh lastRefreshedAt');
        const provider = state.periods.allTime.providers.find((entry) => entry.provider === PROVIDER);
        must(provider && provider.cost === 1.25 && provider.tokens.total === 1500, `the seeded session is not in the all-time totals: ${JSON.stringify(state.periods.allTime.providers)}`);
        must(state.periods.today.providers.some((entry) => entry.provider === PROVIDER), 'the seeded session is not in the today totals');
      },
    },
    {
      action: 'summary',
      params: { argv: ['summary', 'today'] },
      expect: (result) => expectContains(result, 'Usage (Today): ', 'Top providers: ', `${PROVIDER} $1.25 (1.5k)`, 'Last refreshed '),
    },
    {
      action: 'summary',
      params: { argv: ['summary', 'all'] },
      expect: (result) => expectContains(result, 'Usage (All Time): ', `${PROVIDER} $1.25 (1.5k)`),
    },
    {
      action: 'sessions',
      params: { argv: ['sessions', 'today', '5'] },
      expect: (result) => expectContains(result, 'Top sessions by cost (Today):', `1. $1.25 · 1.5k tokens · 1 msgs · ${SESSION_NAME}`),
    },
    {
      action: 'config',
      params: { argv: ['config'] },
      async expect(result, ctx) {
        const minutes = (await usageState(ctx)).settings.refreshIntervalMinutes;
        expectText(result, `Auto-refresh interval: ${describeInterval(minutes)}.`);
      },
    },
    {
      action: 'config',
      params: { argv: ['config', '360'] },
      async expect(result, ctx) {
        expectText(result, 'Auto-refresh interval set to every 6 hours.');
        must((await usageState(ctx)).settings.refreshIntervalMinutes === 360, 'the state file does not hold the new interval');
      },
    },
    {
      action: 'config',
      params: { argv: ['config'] },
      expect: (result) => expectText(result, 'Auto-refresh interval: every 6 hours.'),
    },
    {
      // An interval outside the allowed list is refused and the setting stays.
      action: 'config',
      params: { argv: ['config', '7'] },
      async expect(result, ctx) {
        expectError(result, 'refreshIntervalMinutes must be one of');
        must((await usageState(ctx)).settings.refreshIntervalMinutes === 360, 'a refused interval changed the setting');
      },
    },
    {
      // Puts the default back and removes the seeded session file.
      action: 'config',
      params: { argv: ['config', '30'] },
      async expect(result, ctx) {
        expectText(result, 'Auto-refresh interval set to every 30 minutes.');
        must((await usageState(ctx)).settings.refreshIntervalMinutes === 30, 'the state file does not hold 30 minutes');
        await fs.rm(path.join(await profileDir(ctx), 'agent', 'sessions', 'tc-usage'), { recursive: true, force: true });
      },
    },
  ],
};
