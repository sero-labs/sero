import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { buildMcpPromptBlock } from './prompt';
import { getMcpRuntime } from './runtime/mcp-runtime';
import { registerMcpManagerTool } from './tools/manager-tool';
import { registerMcpProxyTool } from './tools/proxy-tool';
import { configureAgentPluginMcpSource } from './config/agent-plugin-source';

const runtime = getMcpRuntime();

export default function mcpExtension(pi: ExtensionAPI) {
  const releaseAgentPluginSource = configureAgentPluginMcpSource(pi.events);
  runtime.attachPi(pi);

  pi.on('before_agent_start', async (event) => ({
    systemPrompt: event.systemPrompt + buildMcpPromptBlock(),
  }));

  pi.on('session_start', async (_event, ctx) => {
    await runtime.handleSessionStart({ cwd: ctx.cwd }).catch((error) => {
      console.error('[mcp] Failed to bootstrap runtime on session start', error);
    });
  });

  pi.on('session_shutdown', async () => {
    releaseAgentPluginSource();
    await runtime.handleSessionShutdown().catch((error) => {
      console.error('[mcp] Failed to shut down runtime cleanly', error);
    });
  });

  // Register the preferred agent-facing MCP tool first so tool listings
  // present `mcp` before the more specialized management surface.
  registerMcpProxyTool(pi, runtime);
  registerMcpManagerTool(pi, runtime);
}
