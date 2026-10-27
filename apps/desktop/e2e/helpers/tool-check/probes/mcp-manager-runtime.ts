/**
 * `mcp_manager` steps that act on the connected fixture server: connection,
 * resource reads, remote skills and the MCP app viewer. The server comes from
 * the config steps, so this list runs after them.
 */
import { expectText } from '../expect';
import type { ScenarioStep, StepContext, ToolCallResult } from '../types';
import {
  detailsOf,
  expectConnected,
  readJson,
  appFile,
  STDIO_SERVER,
  stringDetail,
} from './mcp-support';

const DASHBOARD = 'ui://fixture/dashboard';
const RELEASE_NOTES = 'skill://docs/release-notes/SKILL.md';

interface SkillRow { serverName: string; name: string; uri: string; enabled: boolean }
interface SkillsFile { skills: Array<{ serverName: string; uri: string; enabled: boolean; entry: { frontmatter: { name: string } } }> }

/** The fixture's skills as the plugin saved them in `skills.json`. */
function savedSkills(ctx: StepContext): SkillRow[] {
  return readJson<SkillsFile>(appFile(ctx, 'skills.json')).skills
    .filter((skill) => skill.serverName === STDIO_SERVER)
    .map((skill) => ({ serverName: skill.serverName, name: skill.entry.frontmatter.name, uri: skill.uri, enabled: skill.enabled }));
}

async function viewerPage(url: string): Promise<number> {
  return (await fetch(url)).status;
}

/** Fails unless the viewer URL answers 200 (open session) or 403 (closed or unknown session). */
async function expectViewer(url: string, status: 200 | 403): Promise<void> {
  const actual = await viewerPage(url);
  if (actual !== status) throw new Error(`${url} answered ${actual}, expected ${status}`);
}

async function expectOpened(result: ToolCallResult, ctx: StepContext, key: 'viewerA' | 'viewerB'): Promise<void> {
  const details = detailsOf(result);
  const viewerId = stringDetail(result, 'viewerId');
  const viewerUrl = stringDetail(result, 'viewerUrl');
  if (details.resourceUri !== DASHBOARD) throw new Error(`opened ${String(details.resourceUri)}, expected ${DASHBOARD}`);
  await expectViewer(viewerUrl, 200);
  ctx.state[key] = { viewerId, viewerUrl };
}

function viewerOf(ctx: StepContext, key: 'viewerA' | 'viewerB'): { viewerId: string; viewerUrl: string } {
  return ctx.state[key] as { viewerId: string; viewerUrl: string };
}

export const runtimeSteps: ScenarioStep[] = [
  {
    action: 'connect_server',
    params: { action: 'connect_server', serverName: STDIO_SERVER },
    expect(result, ctx) {
      expectText(result, `MCP server "${STDIO_SERVER}"`);
      const details = detailsOf(result);
      if (details.connectionStatus !== 'connected') throw new Error(`connection status is ${String(details.connectionStatus)}: ${result.text}`);
      // The tool count is read from the file the plugin wrote, not only from the reply.
      expectConnected(ctx, STDIO_SERVER);
    },
  },
  {
    action: 'reconnect_server',
    params: { action: 'reconnect_server', serverName: STDIO_SERVER },
    expect(result, ctx) {
      expectText(result, `Reconnected MCP server "${STDIO_SERVER}".`);
      expectConnected(ctx, STDIO_SERVER);
    },
  },
  {
    action: 'read_resource',
    params: { action: 'read_resource', serverName: STDIO_SERVER, resourceUri: 'noise://test' },
    expect(result) {
      expectText(result, `Loaded resource "noise://test" from "${STDIO_SERVER}".`);
      const preview = detailsOf(result).resourcePreview as { previewKind?: string; text?: string } | undefined;
      // The text is the fixture server's own reply.
      if (preview?.previewKind !== 'text' || preview.text !== 'deterministic noise fixture') {
        throw new Error(`unexpected preview: ${JSON.stringify(preview)}`);
      }
    },
  },
  {
    action: 'refresh_skills',
    params: { action: 'refresh_skills', serverName: STDIO_SERVER },
    expect(result, ctx) {
      expectText(result, 'Refreshed remote skills.');
      const names = savedSkills(ctx).map((skill) => skill.name).sort();
      if (names.join() !== 'daily,release-notes') throw new Error(`skills.json holds ${names.join()}`);
    },
  },
  {
    action: 'list_skills',
    params: { action: 'list_skills' },
    expect(result) {
      const listed = (detailsOf(result).skills as SkillRow[]).filter((skill) => skill.serverName === STDIO_SERVER);
      if (listed.map((skill) => skill.name).sort().join() !== 'daily,release-notes') {
        throw new Error(`listed skills: ${JSON.stringify(listed)}`);
      }
      if (listed.some((skill) => skill.enabled)) throw new Error('a skill is on before anyone turned it on');
    },
  },
  {
    action: 'set_skill_enabled',
    params: { action: 'set_skill_enabled', serverName: STDIO_SERVER, skillUri: RELEASE_NOTES, enabled: true },
    expect(result, ctx) {
      expectText(result, `Turned on the skill release-notes from ${STDIO_SERVER}.`);
      const saved = savedSkills(ctx);
      if (saved.find((skill) => skill.uri === RELEASE_NOTES)?.enabled !== true) throw new Error('skills.json does not show release-notes on');
      if (saved.some((skill) => skill.uri !== RELEASE_NOTES && skill.enabled)) throw new Error('another skill was turned on too');
    },
  },
  {
    // The viewer is a local web page; it answers 200 while its session is open.
    action: 'open_resource',
    params: { action: 'open_resource', serverName: STDIO_SERVER, resourceUri: DASHBOARD },
    expect: async (result, ctx) => {
      expectText(result, `Opened MCP UI resource "${DASHBOARD}" from "${STDIO_SERVER}".`);
      await expectOpened(result, ctx, 'viewerA');
    },
  },
  {
    action: 'open_tool_ui',
    params: { action: 'open_tool_ui', serverName: STDIO_SERVER, toolName: 'show_dashboard', toolArguments: { region: 'EMEA' } },
    expect: async (result, ctx) => {
      // The tool names its own app, so the resource URI is found without being passed.
      expectText(result, `Opened MCP tool UI for "show_dashboard" from "${STDIO_SERVER}".`);
      await expectOpened(result, ctx, 'viewerB');
    },
  },
  {
    action: 'close_viewer',
    params: (ctx) => ({ action: 'close_viewer', viewerId: viewerOf(ctx, 'viewerA').viewerId }),
    expect: async (result, ctx) => {
      expectText(result, 'Closed the MCP viewer session.');
      if (detailsOf(result).sessionClosed !== true) throw new Error('details.sessionClosed is not true');
      // The closed session's page is refused; the other viewer is untouched.
      await expectViewer(viewerOf(ctx, 'viewerA').viewerUrl, 403);
      await expectViewer(viewerOf(ctx, 'viewerB').viewerUrl, 200);
    },
  },
];
