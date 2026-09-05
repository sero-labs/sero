/**
 * Starting the gateway on purpose has to be remembered.
 *
 * Pairing a device starts the gateway as a side effect. When that start
 * was not recorded, the gateway came up for that session only, and the
 * device just paired could not reach the desktop after a restart. That
 * reads as the token having expired, which it has not.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setGatewayEnabled: vi.fn(),
  shouldAutoStartGateway: vi.fn(() => false),
  start: vi.fn(async () => {}),
  getStatus: vi.fn(() => ({ running: true, port: 18800, host: '127.0.0.1', clients: 0 })),
}));

vi.mock('@electron/shared/settings/gateway-settings', () => ({
  setGatewayEnabled: mocks.setGatewayEnabled,
  shouldAutoStartGateway: mocks.shouldAutoStartGateway,
}));

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  gatewayServer: {
    start: mocks.start,
    stop: vi.fn(async () => {}),
    getStatus: mocks.getStatus,
    getAuth: vi.fn(),
    getPreviewPorts: vi.fn(() => ({ previewPort: 18801, previewTlsPort: 18802 })),
    setAgentOps: vi.fn(),
    setWebChatHtml: vi.fn(),
    getToken: vi.fn(() => 'token'),
  },
  tailscale: { getStatus: vi.fn(async () => ({ running: false })), serve: vi.fn() },
  webChatServer: {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    buildHtml: vi.fn(() => '<html></html>'),
  },
}));

vi.mock('@electron/features/gateway/bridge/agent-bridge', () => ({
  getGatewayAgentOps: vi.fn(() => null),
  setGatewayEventSink: vi.fn(),
  setGatewayCostTracker: vi.fn(),
}));
vi.mock('@electron/features/gateway/bridge/choice-bridge', () => ({
  registerGatewayChoiceBridge: vi.fn(),
}));
vi.mock('@electron/features/gateway/bridge/notification-bridge', () => ({
  registerGatewayNotificationBridge: vi.fn(),
}));
vi.mock('@electron/features/gateway/bridge/qr-encode', () => ({
  generateQrDataUrl: vi.fn(async () => 'data:image/png;base64,'),
}));
vi.mock('@electron/features/gateway/channels/discord', () => ({
  DiscordAdapter: class {},
}));

import { startGatewayAndRemember } from '@electron/ipc/gateway/gateway';

describe('starting the gateway on purpose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records the choice, so the next launch starts it too', async () => {
    await startGatewayAndRemember();

    expect(mocks.setGatewayEnabled).toHaveBeenCalledWith(true);
  });

  it('records the choice even when the port is taken', async () => {
    // startGateway logs a failed listen and returns, so nothing throws
    // here. The choice must still be recorded, or a port clash on one
    // launch would quietly turn Remote Control off for every later one.
    mocks.start.mockRejectedValueOnce(new Error('port in use'));

    await startGatewayAndRemember();

    expect(mocks.setGatewayEnabled).toHaveBeenCalledWith(true);
  });
});
