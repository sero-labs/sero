/**
 * Shared pieces of the `mcp` and `mcp_manager` probes: the test servers, the
 * paths the plugin writes, and a way to run a plugin tool from a step's setup.
 *
 * A step's setup runs through `window.sero.appAgent.invokeTool`, the bridge the
 * MCP contract spec uses. It reaches the same MCP runtime as the chat, so a
 * probe can prepare what it needs without relying on the other probe.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pageOf, waitUntil } from '../files';
import type { StepContext, ToolCallResult } from '../types';

/** The fixture server over stdio: tools, a resource, MCP apps and remote skills. */
export const STDIO_SERVER = 'tc-mcp';
/** The same fixture over HTTP, which is the only mode that runs MCP Tasks. */
export const HTTP_SERVER = 'tc-mcp-http';
/** A local OAuth server that fronts the HTTP fixture. */
export const OAUTH_SERVER = 'tc-oauth';

export const FIXTURE_PATH = path.resolve(__dirname, '../../../fixtures/test-mcp-server/server.mts');

export type Details = Record<string, unknown>;

export interface AppResult {
  text: string;
  details: Details | null;
  isError: boolean;
}

/** Runs a plugin tool through the app bridge and returns its result, failed or not. */
export async function viaApp(ctx: StepContext, tool: 'mcp' | 'mcp_manager', params: Record<string, unknown>): Promise<AppResult> {
  const result = await pageOf(ctx).evaluate(
    ({ id, name, toolParams }) => window.sero.appAgent.invokeTool('mcp', id, name, toolParams),
    { id: ctx.workspaceId, name: tool, toolParams: params },
  );
  return { text: result.text, details: result.details, isError: result.isError };
}

/** Like `viaApp`, but a failed result throws, because a setup that failed proves nothing. */
export async function viaAppOk(ctx: StepContext, tool: 'mcp' | 'mcp_manager', params: Record<string, unknown>): Promise<AppResult> {
  const result = await viaApp(ctx, tool, params);
  if (result.isError || result.text.startsWith('Error:')) {
    throw new Error(`setup ${tool} ${String(params.action)} failed: ${result.text}`);
  }
  return result;
}

/** The result's details, which `mcp_manager` keeps through `sero-cli`. The `mcp` command drops them. */
export function detailsOf(result: ToolCallResult): Details {
  const details = result.details;
  if (!details || typeof details !== 'object') throw new Error(`the result carries no details: ${result.text}`);
  return details as Details;
}

export function stringDetail(result: ToolCallResult, key: string): string {
  const value = detailsOf(result)[key];
  if (typeof value !== 'string' || !value) throw new Error(`details.${key} is not a string: ${JSON.stringify(detailsOf(result))}`);
  return value;
}

/** Fails unless the text matches the pattern. */
export function expectMatch(result: ToolCallResult, pattern: RegExp): RegExpExecArray {
  const match = pattern.exec(result.text);
  if (!match) throw new Error(`result does not match ${pattern}: ${result.text}`);
  return match;
}

// ── Where the plugin keeps its files ──────────────────────────────────────

/** Stores the config and state paths a result named, for the checks that read the files. */
export function rememberPaths(ctx: StepContext, details: Details): void {
  const { configPath, statePath } = details;
  if (typeof configPath !== 'string' || typeof statePath !== 'string') {
    throw new Error(`no configPath and statePath in details: ${JSON.stringify(details)}`);
  }
  ctx.state.configPath = configPath;
  ctx.state.statePath = statePath;
}

/** Learns the paths from a `bootstrap` through the app bridge, once. */
export async function ensurePaths(ctx: StepContext): Promise<void> {
  if (typeof ctx.state.configPath === 'string') return;
  const bootstrap = await viaAppOk(ctx, 'mcp_manager', { action: 'bootstrap' });
  rememberPaths(ctx, bootstrap.details ?? {});
}

function pathOf(ctx: StepContext, key: 'configPath' | 'statePath'): string {
  const value = ctx.state[key];
  if (typeof value !== 'string') throw new Error(`${key} is not known yet`);
  return value;
}

/** `<home>/apps/mcp/config.json` sits three folders under the profile home. */
export function seroHomeOf(ctx: StepContext): string {
  return path.dirname(path.dirname(path.dirname(pathOf(ctx, 'configPath'))));
}

export function appFile(ctx: StepContext, name: string): string {
  return path.join(seroHomeOf(ctx), 'apps', 'mcp', name);
}

/** The folder of one server's saved OAuth files (`PI_CODING_AGENT_DIR` is `<home>/agent`). */
export function oauthDir(ctx: StepContext, serverName: string): string {
  return path.join(seroHomeOf(ctx), 'agent', 'mcp-oauth', encodeURIComponent(serverName));
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export interface ConfigFile {
  mcpServers: Record<string, Record<string, unknown>>;
}

export function readConfigFile(ctx: StepContext): ConfigFile {
  return readJson<ConfigFile>(pathOf(ctx, 'configPath'));
}

export interface ServerState {
  serverName: string;
  enabled: boolean;
  connectionStatus: string;
  authStatus: string;
  toolCount: number;
}

/** One server as the plugin last wrote it to its state file. */
export function serverState(ctx: StepContext, serverName: string): ServerState {
  const state = readJson<{ servers: ServerState[] }>(pathOf(ctx, 'statePath'));
  const server = state.servers.find((entry) => entry.serverName === serverName);
  if (!server) throw new Error(`state.json has no server ${serverName}`);
  return server;
}

/** Fails unless the state file shows the server connected with tools. */
export function expectConnected(ctx: StepContext, serverName: string): void {
  const server = serverState(ctx, serverName);
  if (server.connectionStatus !== 'connected' || server.toolCount <= 0) {
    throw new Error(`state.json shows ${serverName} as ${server.connectionStatus} with ${server.toolCount} tools`);
  }
}

// ── Servers ─────────────────────────────────────────────────────────────────

/** The `upsert_server` parameters for the stdio fixture. */
export const stdioServerParams = {
  action: 'upsert_server',
  serverName: STDIO_SERVER,
  transport: 'stdio',
  // The app's PATH may hold an older node than the fixture needs.
  command: process.execPath,
  argsText: FIXTURE_PATH,
  lifecycle: 'lazy',
  authMode: 'none',
  exposeResources: true,
  enabled: true,
} as const;

/** Naming the server as its own original makes an upsert replace it, so a setup can repeat. */
async function upsert(ctx: StepContext, params: Record<string, unknown>): Promise<void> {
  await viaAppOk(ctx, 'mcp_manager', { ...params, originalServerName: params.serverName });
}

export async function ensureStdioServer(ctx: StepContext): Promise<void> {
  await ensurePaths(ctx);
  await upsert(ctx, stdioServerParams);
}

export async function ensureHttpServer(ctx: StepContext): Promise<void> {
  await ensurePaths(ctx);
  await upsert(ctx, { ...stdioServerParams, serverName: HTTP_SERVER, transport: 'http', url: await httpFixtureUrl(), command: '', argsText: '' });
}

// ── The HTTP fixture, started on first use ─────────────────────────────

let httpFixture: Promise<string> | undefined;
let httpChild: ChildProcess | undefined;

/** Starts `server.mts --http` once and returns its MCP URL (its first output line). */
export function httpFixtureUrl(): Promise<string> {
  httpFixture ??= new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [FIXTURE_PATH, '--http'], { stdio: ['ignore', 'pipe', 'inherit'] });
    httpChild = child;
    // An early stop must not leave the server running.
    process.once('exit', () => child.kill());
    child.once('error', reject);
    child.once('exit', () => { httpFixture = undefined; httpChild = undefined; });
    child.stdout?.once('data', (chunk: Buffer) => resolve(chunk.toString().trim()));
  });
  return httpFixture;
}

export function stopHttpFixture(): void {
  httpChild?.kill();
}

// ── Tasks ───────────────────────────────────────────────────────────────────────

/**
 * Starts a `run_report` task on the HTTP fixture through the app bridge. The
 * `hold` plan never ends on its own; `complete` ends after `delayMs`.
 */
export async function startReportTask(ctx: StepContext, region: string, plan: 'hold' | 'complete', delayMs = 300): Promise<string> {
  const started = await viaAppOk(ctx, 'mcp', {
    action: 'call_tool',
    serverName: HTTP_SERVER,
    toolName: 'run_report',
    toolArguments: { plan, region, delayMs },
  });
  const taskId = started.details?.taskId;
  if (typeof taskId !== 'string') throw new Error(`no task id in: ${started.text}`);
  return taskId;
}

/** The task id in a `call_tool` result that started a task (`mcp` returns text only). */
export function taskIdFromText(result: ToolCallResult): string {
  return expectMatch(result, /Check it: sero mcp task status (.+)$/m)[1]!;
}

/** Waits until the task has ended, which the plugin records in `tasks.json` as the tracker learns it from the fixture. */
export async function waitForTaskEnd(ctx: StepContext, taskId: string): Promise<void> {
  const file = appFile(ctx, 'tasks.json');
  await waitUntil(path.dirname(file), `task ${taskId} to end`, async () => {
    if (!fs.existsSync(file)) return false;
    const row = readJson<{ tasks: Array<{ taskId: string; status: string }> }>(file).tasks.find((task) => task.taskId === taskId);
    return row !== undefined && ['completed', 'failed', 'cancelled'].includes(row.status);
  }, 15_000);
}
