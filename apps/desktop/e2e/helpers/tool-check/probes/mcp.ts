/**
 * The `mcp` tool: status, discovery, tool calls, resource reads, remote
 * skills, tasks, and the explicit connect and reconnect.
 *
 * A chat reaches `mcp` through `sero-cli`, and this tool parses its own command
 * line (`mcp call <server> <tool> [json]`), so each step passes `{ argv }`, the
 * tokens after `mcp`. The CLI form also drops the result's details, so every
 * check here reads the result text, the plugin's files in the profile, or the
 * fixture server's own reply.
 *
 * The first step prepares the servers itself, so this probe does not depend on
 * the `mcp_manager` probe having run.
 */
import { expectText } from '../expect';
import type { ScenarioStep, StepContext, ToolProbe } from '../types';
import {
  ensureHttpServer,
  ensureStdioServer,
  expectConnected,
  expectMatch,
  HTTP_SERVER,
  readConfigFile,
  stopHttpFixture,
  STDIO_SERVER,
  taskIdFromText,
  viaAppOk,
} from './mcp-support';

const RELEASE_NOTES = 'skill://docs/release-notes/SKILL.md';

const heldId = (ctx: StepContext) => String(ctx.state.heldTask);
const waitedId = (ctx: StepContext) => String(ctx.state.waitedTask);

/** Starts a report task in this chat and keeps its id. The text is `runs as task <id>.` plus the follow-up commands. */
function startTask(key: 'heldTask' | 'waitedTask', region: string, plan: 'hold' | 'complete'): ScenarioStep {
  return {
    action: 'call_tool',
    setup: ensureHttpServer,
    params: { argv: ['call', HTTP_SERVER, 'run_report', JSON.stringify({ plan, region, delayMs: 400 })] },
    expect(result, ctx) {
      expectText(result, `MCP tool ${HTTP_SERVER}.run_report runs as task`);
      ctx.state[key] = taskIdFromText(result);
    },
  };
}

const discoverySteps: ScenarioStep[] = [
  {
    action: 'status',
    setup: ensureStdioServer,
    params: { argv: ['status'] },
    expect(result, ctx) {
      const servers = Object.keys(readConfigFile(ctx).mcpServers);
      if (!servers.includes(STDIO_SERVER)) throw new Error(`config.json has no ${STDIO_SERVER}`);
      // The count is what the config file holds.
      expectText(result, `MCP status: ${servers.length} server(s) configured`);
    },
  },
  {
    action: 'list',
    params: { argv: ['list'] },
    expect(result) {
      expectMatch(result, new RegExp(`^- ${STDIO_SERVER} \\(enabled, `, 'm'));
    },
  },
  {
    // Switching the server off and on closes any connection, so this call connects for real.
    action: 'connect',
    setup: async (ctx) => {
      await viaAppOk(ctx, 'mcp_manager', { action: 'disable_server', serverName: STDIO_SERVER });
      await viaAppOk(ctx, 'mcp_manager', { action: 'enable_server', serverName: STDIO_SERVER });
    },
    params: { argv: ['connect', STDIO_SERVER] },
    expect(result, ctx) {
      expectText(result, `Connected MCP server "${STDIO_SERVER}".`);
      expectConnected(ctx, STDIO_SERVER);
    },
  },
  {
    action: 'reconnect',
    params: { argv: ['reconnect', STDIO_SERVER] },
    expect(result, ctx) {
      expectText(result, `Reconnected MCP server "${STDIO_SERVER}".`);
      expectConnected(ctx, STDIO_SERVER);
    },
  },
  {
    action: 'search',
    params: { argv: ['search', 'echo'] },
    expect(result) {
      expectMatch(result, /^Found \d+ MCP match\(es\) for "echo":/);
      expectText(result, `- [tool] ${STDIO_SERVER}.echo`);
    },
  },
  {
    action: 'list_tools',
    params: { argv: ['tools', STDIO_SERVER] },
    expect(result) {
      expectMatch(result, new RegExp(`^${STDIO_SERVER} tools \\(\\d+\\):`));
      expectText(result, '- echo\n  Echo a deterministic message.');
      expectText(result, '- show_dashboard [UI]');
      // A tool for the server's app only is never shown to the model.
      if (result.text.includes('refresh_dashboard')) throw new Error('an app-only tool was listed');
    },
  },
  {
    action: 'list_resources',
    params: { argv: ['resources', STDIO_SERVER] },
    expect(result) {
      expectMatch(result, new RegExp(`^${STDIO_SERVER} resources \\(\\d+\\):`));
      expectText(result, 'noise://test');
      expectText(result, 'Deterministic test resource.');
    },
  },
  {
    action: 'describe_tool',
    params: { argv: ['describe', STDIO_SERVER, 'echo'] },
    expect(result) {
      expectText(result, `Tool: ${STDIO_SERVER}.echo`);
      expectText(result, 'Echo a deterministic message.');
      expectText(result, 'Input schema:');
      expectText(result, '"message"');
    },
  },
  {
    // The reply is the fixture server's own: `echo: <message>`.
    action: 'call_tool',
    params: { argv: ['call', STDIO_SERVER, 'echo', JSON.stringify({ message: 'tool-check' })] },
    expect: (result) => expectText(result, `MCP tool result from ${STDIO_SERVER}.echo:\n\necho: tool-check`),
  },
  {
    action: 'read_resource',
    params: { argv: ['read', STDIO_SERVER, 'noise://test'] },
    expect(result) {
      expectText(result, `MCP resource from ${STDIO_SERVER}: noise://test`);
      // The fixture sends no MIME type for this resource, so the kind stands alone.
      expectText(result, 'Kind: text\n\ndeterministic noise fixture');
    },
  },
];

/** A skill is off until someone turns it on, so the first step does that and loads the fixture's skill list. */
const skillSteps: ScenarioStep[] = [
  {
    action: 'skill_load',
    setup: async (ctx) => {
      await viaAppOk(ctx, 'mcp_manager', { action: 'refresh_skills', serverName: STDIO_SERVER });
      await viaAppOk(ctx, 'mcp_manager', { action: 'set_skill_enabled', serverName: STDIO_SERVER, skillUri: RELEASE_NOTES, enabled: true });
    },
    params: { argv: ['skill', 'load', STDIO_SERVER, 'release-notes'] },
    expect(result) {
      expectText(result, `<mcp-skill server="${STDIO_SERVER}" uri="${RELEASE_NOTES}">`);
      expectText(result, '# Release notes');
    },
  },
  {
    action: 'skill_read',
    params: { argv: ['skill', 'read', STDIO_SERVER, 'release-notes', 'templates/summary.md'] },
    expect(result) {
      expectText(result, `<mcp-skill server="${STDIO_SERVER}" uri="skill://docs/release-notes/templates/summary.md">`);
      expectText(result, '## Summary');
    },
  },
  {
    action: 'skill_ls',
    params: { argv: ['skill', 'ls', STDIO_SERVER, 'release-notes'] },
    expect(result) {
      if (result.text.trim() !== 'SKILL.md\ntemplates/') throw new Error(`unexpected listing: ${JSON.stringify(result.text)}`);
    },
  },
];

/** Two report tasks on the HTTP fixture: one that never ends (status, cancel) and one that ends soon (wait). */
const taskSteps: ScenarioStep[] = [
  startTask('heldTask', 'held', 'hold'),
  startTask('waitedTask', 'waited', 'complete'),
  {
    action: 'task_status',
    params: (ctx) => ({ argv: ['task', 'status', heldId(ctx)] }),
    expect: (result, ctx) => expectText(result, `MCP task ${heldId(ctx)} (${HTTP_SERVER} · run_report): running.`),
  },
  {
    action: 'task_wait',
    params: (ctx) => ({ argv: ['task', 'wait', waitedId(ctx)] }),
    expect(result, ctx) {
      expectText(result, `MCP task ${waitedId(ctx)} (${HTTP_SERVER} · run_report): completed.`);
      expectText(result, 'report ready: waited');
    },
  },
  {
    action: 'task_cancel',
    params: (ctx) => ({ argv: ['task', 'cancel', heldId(ctx)] }),
    expect: (result, ctx) => expectText(result, `MCP task ${heldId(ctx)} (${HTTP_SERVER} · run_report): cancelled.`),
  },
  {
    // The cancel is kept: a later status read says so. This is the last step, so the HTTP fixture stops here.
    action: 'task_status',
    params: (ctx) => ({ argv: ['task', 'status', heldId(ctx)] }),
    expect(result, ctx) {
      try {
        expectText(result, `MCP task ${heldId(ctx)} (${HTTP_SERVER} · run_report): cancelled.`);
      } finally {
        stopHttpFixture();
      }
    },
  },
];

export const mcpProbe: ToolProbe = {
  tool: 'mcp',
  timeoutMs: 240_000,
  steps: [...discoverySteps, ...skillSteps, ...taskSteps],
};
