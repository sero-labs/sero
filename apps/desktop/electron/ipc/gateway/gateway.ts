/**
 * Gateway IPC handlers — lets the renderer query/control the gateway.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { QrLoginData } from '@/types/ipc';
import { gatewayServer, tailscale, webChatServer } from '@electron/shared/infra/shared-infra';
import { getGatewayAgentOps, setGatewayEventSink, setGatewayCostTracker } from '@electron/features/gateway/bridge/agent-bridge';
import { registerGatewayChoiceBridge } from '@electron/features/gateway/bridge/choice-bridge';
import { registerGatewayNotificationBridge } from '@electron/features/gateway/bridge/notification-bridge';
import { generateQrDataUrl } from '@electron/features/gateway/bridge/qr-encode';
import { DiscordAdapter } from '@electron/features/gateway/channels/discord';
import { setGatewayEnabled, shouldAutoStartGateway } from '@electron/shared/settings/gateway-settings';

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

/** Read env vars and the saved setting. Called at handler registration. */
function seedConfigFromEnv(): void {
  // The renderer asks for this config to draw the toggle, so it has to
  // start out matching what the app actually did at boot.
  gatewayConfig.enabled = shouldAutoStartGateway();
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
      if (enabled) {
        await startGatewayAndRemember();
      } else {
        gatewayConfig.enabled = false;
        setGatewayEnabled(false);
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
      // Pairing a device is asking for Remote Control, so it is
      // remembered. Without this the gateway came up for this session
      // only, and the paired device could not reach it after a restart.
      await startGatewayAndRemember();

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
        ? await tailscale.serve(status.port, gatewayServer.getPreviewPorts())
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

/**
 * Start the gateway because someone asked for it, and remember that.
 *
 * Every deliberate start goes through here: the Remote Control toggle
 * and pairing a device. Boot calls `startGateway` directly, because it
 * is acting on the record rather than making one.
 *
 * The record is written first. A start that fails should still leave
 * the choice, so the next launch tries again rather than forgetting.
 */
export async function startGatewayAndRemember(): Promise<void> {
  gatewayConfig.enabled = true;
  setGatewayEnabled(true);
  await startGateway();
}

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
    // Wire interactive choices: pending questions → gateway clients.
    registerGatewayChoiceBridge(gatewayServer);
    // Wire the notification feed: new entries → gateway clients.
    registerGatewayNotificationBridge(gatewayServer);
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
    const url = await tailscale.serve(
      gatewayServer.getStatus().port,
      gatewayServer.getPreviewPorts(),
    );
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
  await Promise.all([
    tailscale.unserve(),
    webChatServer.stop(),
    gatewayServer.stop(),
  ]);
  console.log('[gateway] All services stopped');
}
