/**
 * Gateway IPC handlers — lets the renderer query/control the gateway.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { QrLoginData } from '@/types/ipc';
import { gatewayServer, tailscale, webChatServer } from '@electron/shared/infra/shared-infra';
import { getGatewayAgentOps, setGatewayEventSink, setGatewayCostTracker } from '@electron/features/gateway/bridge/agent-bridge';
import { generateQrDataUrl } from '@electron/features/gateway/bridge/qr-encode';
import { DiscordAdapter } from '@electron/features/gateway/channels/discord';

export interface GatewayConfig {
  enabled: boolean;
  tailscaleEnabled: boolean;
  discordBotToken: string;
  discordAllowedUsers: string[];
}

/**
 * Gateway config — populated lazily by seedConfigFromEnv() because
 * loadSeroEnv() hasn't run yet when module-level initialisers execute.
 */
let gatewayConfig: GatewayConfig = {
  enabled: false,
  tailscaleEnabled: false,
  discordBotToken: '',
  discordAllowedUsers: [],
};

/** Read env vars into config. Called once at handler registration time. */
function seedConfigFromEnv(): void {
  if (process.env.SERO_DISCORD_TOKEN) {
    gatewayConfig.discordBotToken = process.env.SERO_DISCORD_TOKEN;
  }
  if (process.env.SERO_DISCORD_USERS) {
    gatewayConfig.discordAllowedUsers = process.env.SERO_DISCORD_USERS
      .split(',')
      .map((s) => s.trim());
  }
}

export function registerGatewayHandlers(): void {
  seedConfigFromEnv();
  ipcMain.handle(IpcChannels.gateway.getStatus, async () => {
    const status = gatewayServer.getStatus();
    const tsStatus = await tailscale.getStatus();
    return {
      ...status,
      tailscale: tsStatus,
    };
  });

  ipcMain.handle(IpcChannels.gateway.getToken, async () => {
    return gatewayServer.getToken();
  });

  ipcMain.handle(
    IpcChannels.gateway.setEnabled,
    async (_event, enabled: boolean) => {
      gatewayConfig.enabled = enabled;
      if (enabled) {
        await startGateway();
      } else {
        await stopGateway();
      }
      return gatewayServer.getStatus();
    },
  );

  ipcMain.handle(IpcChannels.gateway.getConfig, async () => {
    return { ...gatewayConfig };
  });

  ipcMain.handle(
    IpcChannels.gateway.setConfig,
    async (_event, config: Partial<GatewayConfig>) => {
      Object.assign(gatewayConfig, config);
      return { ...gatewayConfig };
    },
  );

  ipcMain.handle(
    IpcChannels.gateway.createWebToken,
    async (_event, workspaceIds: string[] | null, label?: string, expiryDays?: number) => {
      const auth = gatewayServer.getAuth();
      return auth.webTokens.create(workspaceIds, label, expiryDays);
    },
  );

  ipcMain.handle(IpcChannels.gateway.listWebTokens, async () => {
    const auth = gatewayServer.getAuth();
    return auth.webTokens.list();
  });

  ipcMain.handle(
    IpcChannels.gateway.revokeWebToken,
    async (_event, tokenId: string) => {
      const auth = gatewayServer.getAuth();
      return auth.webTokens.revoke(tokenId);
    },
  );

  ipcMain.handle(
    IpcChannels.gateway.getQrLoginData,
    async (_event, expiryDays?: number): Promise<QrLoginData> => {
      await startGateway();

      // Clamp expiry to 1–30 days to prevent bogus values from the renderer.
      const days = Math.max(1, Math.min(expiryDays ?? 7, 30));
      const auth = gatewayServer.getAuth();
      const webToken = auth.webTokens.create(
        null,
        `QR login ${new Date().toLocaleDateString()}`,
        days,
      );

      // Determine the best base URL for the login link.
      // Only use the tailnet URL after we have explicitly exposed the gateway
      // via `tailscale serve`; otherwise the hostname can return 502s.
      const status = gatewayServer.getStatus();
      const tsStatus = await tailscale.getStatus();
      const tailnetUrl = tsStatus.running
        ? await tailscale.serve(status.port)
        : null;
      const baseUrl = tailnetUrl ?? `http://127.0.0.1:${status.port}`;

      const loginUrl = new URL('/', baseUrl);
      loginUrl.searchParams.set('token', webToken.token);
      const loginUrlStr = loginUrl.toString();
      const qrDataUrl = await generateQrDataUrl(loginUrlStr);

      return {
        qrDataUrl,
        loginUrl: loginUrlStr,
        expiresAt: webToken.expiresAt,
        expiryDays: days,
      };
    },
  );
}

// ── Gateway lifecycle (called from main.ts) ─────────────────

export { startGateway, stopGateway };

async function startGateway(): Promise<void> {
  // Wire agent operations
  const ops = getGatewayAgentOps();
  if (ops) {
    gatewayServer.setAgentOps(ops);
  } else {
    console.warn('[gateway] Agent ops not yet registered — gateway will reject requests until ready');
  }

  // Register web chat HTML so the gateway also serves it at "/" on
  // the same port — essential for Tailscale (single port exposure).
  gatewayServer.setWebChatHtml(() => webChatServer.buildHtml());

  try {
    await gatewayServer.start();
    // Eagerly resolve the token so it's logged on boot.
    gatewayServer.getToken();
    // Wire event forwarding: agent events → gateway WebSocket clients.
    setGatewayEventSink(gatewayServer);
    // Wire cost tracking for gateway-initiated sessions.
    setGatewayCostTracker(gatewayServer.costTracker);
  } catch (err) {
    console.error('[gateway] Failed to start:', err);
    return;
  }

  // Also start the standalone web chat server on its own port (18801)
  // for local access. Both ports serve the same UI.
  try {
    await webChatServer.start();
  } catch (err) {
    console.error('[gateway] Failed to start web chat on standalone port:', err);
  }

  // Tailscale: if enabled, expose on tailnet
  if (gatewayConfig.tailscaleEnabled) {
    const url = await tailscale.serve(gatewayServer.getStatus().port);
    if (url) {
      console.log(`[gateway] Available on tailnet: ${url}`);
    }
  }

  // Discord: if configured, start the adapter
  console.log(`[gateway] Discord: ${gatewayConfig.discordBotToken ? 'configured' : 'not configured'}`);
  if (gatewayConfig.discordBotToken && ops) {
    try {
      const discord = new DiscordAdapter(gatewayServer, ops, {
        botToken: gatewayConfig.discordBotToken,
        allowedUsers: gatewayConfig.discordAllowedUsers,
        defaultWorkspaceId: 'global',
      });
      await discord.start();
    } catch (err) {
      console.error('[gateway] Failed to start Discord adapter:', err);
    }
  }
}

async function stopGateway(): Promise<void> {
  await tailscale.unserve();

  await webChatServer.stop();

  await gatewayServer.stop();
  console.log('[gateway] All services stopped');
}
