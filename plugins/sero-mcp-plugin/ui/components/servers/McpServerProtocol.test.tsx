// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { McpServerSnapshot } from '../../../shared/types';
import { McpServerProtocolBadges, McpServerProtocolCard } from './McpServerProtocol';

function server(overrides: Partial<McpServerSnapshot>): McpServerSnapshot {
  return {
    serverName: 'demo',
    enabled: true,
    transport: 'http',
    lifecycle: 'eager',
    authMode: 'none',
    connectionStatus: 'connected',
    authStatus: 'not-required',
    toolCount: 0,
    resourceCount: 0,
    uiToolCount: 0,
    resources: [],
    uiTools: [],
    ...overrides,
  };
}

describe('McpServerProtocol', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  async function render(snapshot: McpServerSnapshot) {
    await act(async () => {
      root?.render(<><McpServerProtocolBadges server={snapshot} /><McpServerProtocolCard server={snapshot} /></>);
    });
    return container.textContent ?? '';
  }

  it('shows the revision and extensions of a modern server', async () => {
    const text = await render(server({
      protocol: {
        era: 'modern', version: '2026-07-28', extensions: ['io.modelcontextprotocol/ui'],
        serverVersion: 'demo 1.0.0', deprecatedTransport: false, eraFromVerdict: false,
      },
      cache: { state: 'fresh', cachedAt: '2026-09-25T10:00:00.000Z' },
    }));

    expect(text).toContain('2026-07-28');
    expect(text).toContain('MCP Apps');
    expect(text).toContain('Streamable HTTP');
    expect(text).not.toContain('deprecated');
  });

  it('warns about a saved SSE server', async () => {
    const text = await render(server({
      protocol: {
        era: 'legacy', version: '2025-03-26', extensions: [],
        serverVersion: null, deprecatedTransport: true, eraFromVerdict: false,
      },
    }));

    expect(text).toContain('SSE, deprecated');
    expect(text).toContain('Ask the server owner for a Streamable HTTP URL.');
    expect(text).toContain('2025-03-26, legacy handshake');
  });

  it('names the failed step', async () => {
    const text = await render(server({ connectionStatus: 'error', failurePhase: 'auth' }));

    expect(text).toContain('Sign-in failed');
    expect(text).toContain('Not connected');
  });
});
