/**
 * `mcp_manager` steps that read and change the MCP config file: bootstrap,
 * refresh, diagnostics, raw config, and the server edit actions. Each effect is
 * read back from `config.json` or `state.json` in the profile.
 */
import fs from 'node:fs';
import { expectText } from '../expect';
import type { ScenarioStep, StepContext } from '../types';
import {
  detailsOf,
  expectMatch,
  FIXTURE_PATH,
  readConfigFile,
  readJson,
  rememberPaths,
  STDIO_SERVER,
  stdioServerParams,
  stringDetail,
} from './mcp-support';

/** A second server, written by `save_raw_config` and then edited, so the fixture server stays untouched. */
const RAW_SERVER = 'tc-raw';

function enabledOnDisk(ctx: StepContext): number {
  return Object.values(readConfigFile(ctx).mcpServers).filter((server) => server.enabled !== false).length;
}

export const configSteps: ScenarioStep[] = [
  {
    action: 'bootstrap',
    params: { action: 'bootstrap' },
    expect(result, ctx) {
      expectText(result, 'Initialized MCP app state for');
      rememberPaths(ctx, detailsOf(result));
      const state = readJson<{ initialized: boolean }>(stringDetail(result, 'statePath'));
      if (state.initialized !== true) throw new Error('state.json was not written as initialized');
      if (typeof readConfigFile(ctx).mcpServers !== 'object') throw new Error('config.json has no mcpServers object');
    },
  },
  {
    action: 'refresh',
    params: { action: 'refresh' },
    setup: async (ctx) => {
      // The state file stamps every rebuild, so a refresh must change the stamp.
      ctx.state.stampBefore = readJson<{ lastRefreshedAt: string }>(String(ctx.state.statePath)).lastRefreshedAt;
    },
    expect(result, ctx) {
      expectText(result, 'Refreshed MCP app state for');
      const stamp = readJson<{ lastRefreshedAt: string }>(String(ctx.state.statePath)).lastRefreshedAt;
      if (stamp === ctx.state.stampBefore) throw new Error('state.json was not rewritten by refresh');
    },
  },
  {
    action: 'get_diagnostics',
    params: { action: 'get_diagnostics' },
    expect(result, ctx) {
      expectText(result, `Config: ${String(ctx.state.configPath)}`);
      expectText(result, `State: ${String(ctx.state.statePath)}`);
      const servers = Object.keys(readConfigFile(ctx).mcpServers).length;
      expectText(result, `Servers: ${servers}`);
    },
  },
  {
    action: 'get_raw_config',
    params: { action: 'get_raw_config' },
    expect(result, ctx) {
      expectText(result, '"mcpServers"');
      const disk = fs.readFileSync(String(ctx.state.configPath), 'utf8');
      if (stringDetail(result, 'rawConfig') !== disk) throw new Error('details.rawConfig differs from config.json');
      if (JSON.stringify(JSON.parse(result.text)) !== JSON.stringify(JSON.parse(disk))) throw new Error('the text differs from config.json');
    },
  },
  {
    action: 'save_raw_config',
    params: {
      action: 'save_raw_config',
      rawConfig: JSON.stringify({
        mcpServers: { [RAW_SERVER]: { enabled: false, transport: 'stdio', command: process.execPath, args: [FIXTURE_PATH], lifecycle: 'lazy' } },
      }),
    },
    expect(result, ctx) {
      expectMatch(result, /^Saved MCP config with \d+ configured server\(s\)\.$/);
      const servers = readConfigFile(ctx).mcpServers;
      if (Object.keys(servers).join() !== RAW_SERVER) throw new Error(`config.json holds ${Object.keys(servers).join()}, expected ${RAW_SERVER}`);
      if (servers[RAW_SERVER]!.enabled !== false) throw new Error(`${RAW_SERVER} should be saved as disabled`);
    },
  },
  {
    action: 'upsert_server',
    params: stdioServerParams,
    expect(result, ctx) {
      expectText(result, `Saved MCP server "${STDIO_SERVER}".`);
      const servers = readConfigFile(ctx).mcpServers;
      const saved = servers[STDIO_SERVER];
      if (!saved) throw new Error(`config.json has no ${STDIO_SERVER}`);
      if (saved.transport !== 'stdio' || saved.command !== process.execPath || saved.lifecycle !== 'lazy' || saved.enabled !== true) {
        throw new Error(`unexpected saved server: ${JSON.stringify(saved)}`);
      }
      if (JSON.stringify(saved.args) !== JSON.stringify([FIXTURE_PATH])) throw new Error(`unexpected args: ${JSON.stringify(saved.args)}`);
      if (!servers[RAW_SERVER]) throw new Error(`${RAW_SERVER} was lost by the upsert`);
    },
  },
  {
    // The legacy action: still answers, with a note that points to `mcp`.
    action: 'status',
    params: { action: 'status' },
    expect(result, ctx) {
      expectText(result, 'action="status" is deprecated');
      expectText(result, `MCP status: ${Object.keys(readConfigFile(ctx).mcpServers).length} server(s) configured`);
      expectText(result, `Enabled: ${enabledOnDisk(ctx)}`);
    },
  },
  {
    action: 'enable_server',
    params: { action: 'enable_server', serverName: RAW_SERVER },
    expect(result, ctx) {
      expectText(result, `Enabled MCP server "${RAW_SERVER}".`);
      if (readConfigFile(ctx).mcpServers[RAW_SERVER]?.enabled !== true) throw new Error(`${RAW_SERVER} is not enabled in config.json`);
    },
  },
  {
    action: 'disable_server',
    params: { action: 'disable_server', serverName: RAW_SERVER },
    expect(result, ctx) {
      expectText(result, `Disabled MCP server "${RAW_SERVER}".`);
      if (readConfigFile(ctx).mcpServers[RAW_SERVER]?.enabled !== false) throw new Error(`${RAW_SERVER} is not disabled in config.json`);
    },
  },
  {
    action: 'remove_server',
    params: { action: 'remove_server', serverName: RAW_SERVER },
    expect(result, ctx) {
      expectText(result, `Removed MCP server "${RAW_SERVER}".`);
      const servers = readConfigFile(ctx).mcpServers;
      if (servers[RAW_SERVER]) throw new Error(`${RAW_SERVER} is still in config.json`);
      if (!servers[STDIO_SERVER]) throw new Error(`${STDIO_SERVER} was removed too`);
    },
  },
];
