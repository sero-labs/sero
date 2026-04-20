import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { getMcpRuntime } from './runtime/mcp-runtime';
import { registerMcpManagerTool } from './tools/manager-tool';
import { registerMcpProxyTool } from './tools/proxy-tool';

const runtime = getMcpRuntime();

export default function mcpExtension(pi: ExtensionAPI) {
  runtime.attachPi(pi);

  pi.on('session_start', async (_event, ctx) => {
    await runtime.handleSessionStart({ cwd: ctx.cwd }).catch((error) => {
      console.error('[mcp] Failed to bootstrap runtime on session start', error);
    });
  });

  pi.on('session_switch', async (_event, ctx) => {
    await runtime.handleSessionSwitch({ cwd: ctx.cwd }).catch((error) => {
      console.error('[mcp] Failed to refresh runtime on session switch', error);
    });
  });

  pi.on('session_shutdown', async () => {
    await runtime.handleSessionShutdown().catch((error) => {
      console.error('[mcp] Failed to shut down runtime cleanly', error);
    });
  });

  registerMcpManagerTool(pi, runtime);
  registerMcpProxyTool(pi, runtime);
}
