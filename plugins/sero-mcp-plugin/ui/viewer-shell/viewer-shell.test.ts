// @vitest-environment jsdom

import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/ext-apps/app-bridge';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VIEWER_SHELL_CONFIG_ID, type ViewerShellConfig } from '../../shared/viewer-shell';
import { HOST_CAPABILITIES, startViewerShell, type ViewerShell } from './viewer-shell';

interface JsonRpcMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

const TOOL_RESULT = { content: [{ type: 'text', text: 'EMEA: 4 rows' }] };
let shell: ViewerShell | null = null;

afterEach(async () => {
  await shell?.bridge.close();
  shell = null;
  document.body.innerHTML = '';
});

describe('viewer shell', () => {
  it('answers ui/initialize and sends the tool input and result to the app', async () => {
    const app = await startShell();

    const initialized = await app.request({ id: 1, method: 'ui/initialize', params: initializeParams() });
    expect(initialized.result).toMatchObject({ hostInfo: { name: 'Sero' }, hostCapabilities: HOST_CAPABILITIES });

    app.send({ method: 'ui/notifications/initialized' });
    const input = await app.next('ui/notifications/tool-input');
    const result = await app.next('ui/notifications/tool-result');
    expect(input.params).toEqual({ arguments: { region: 'EMEA' } });
    expect(result.params).toMatchObject(TOOL_RESULT);
  });

  it('sends an app tool call to the viewer server with the session token', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, result: { content: [{ type: 'text', text: 'ok' }] } }));
    const app = await startShell(fetchMock);
    await app.request({ id: 1, method: 'ui/initialize', params: initializeParams() });

    const response = await app.request({ id: 2, method: 'tools/call', params: { name: 'refresh', arguments: {} } });

    expect(response.result).toMatchObject({ content: [{ type: 'text', text: 'ok' }] });
    expect(fetchMock).toHaveBeenCalledWith('/proxy/tools/call', expect.objectContaining({
      body: JSON.stringify({ token: 'token-1', params: { name: 'refresh', arguments: {} } }),
    }));
  });

  it('loads the app frame from its own origin and keeps that origin', async () => {
    await startShell();

    expect(shell?.frame.getAttribute('src')).toBe('http://app1234.localhost:43123/ui-app');
    expect(shell?.frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-same-origin');
  });

  it('ignores a message from a window that is not the app frame', async () => {
    const app = await startShell();
    const replies: unknown[] = [];
    shell?.frame.contentWindow?.addEventListener('message', (event) => replies.push(event.data));

    window.dispatchEvent(new MessageEvent('message', { data: { jsonrpc: '2.0', id: 9, method: 'ping' }, source: window }));
    await app.request({ id: 1, method: 'ping' });

    expect(replies).toEqual([expect.objectContaining({ id: 1 })]);
  });
});

function initializeParams() {
  return { protocolVersion: LATEST_PROTOCOL_VERSION, appInfo: { name: 'dashboard', version: '1.0.0' }, appCapabilities: {} };
}

/** Starts the shell and acts as the app inside its frame. */
async function startShell(fetchImpl = vi.fn(async () => Response.json({ ok: true, result: {} }))) {
  const config: ViewerShellConfig = {
    token: 'token-1',
    appFrameUrl: 'http://app1234.localhost:43123/ui-app',
    allowAttribute: '',
    toolArgs: { region: 'EMEA' },
    toolResult: TOOL_RESULT,
    hostContext: { displayMode: 'inline' },
    chat: false,
  };
  document.body.innerHTML = `<div id="app"></div><p id="status" hidden></p>
    <script type="application/json" id="${VIEWER_SHELL_CONFIG_ID}">${JSON.stringify(config)}</script>`;
  shell = await startViewerShell(document, fetchImpl);
  const appWindow = shell.frame.contentWindow as Window;
  const received: JsonRpcMessage[] = [];
  const waiters: Array<() => void> = [];
  appWindow.addEventListener('message', (event) => {
    received.push(event.data as JsonRpcMessage);
    waiters.splice(0).forEach((wake) => wake());
  });

  const next = async (match: (message: JsonRpcMessage) => boolean): Promise<JsonRpcMessage> => {
    for (;;) {
      const index = received.findIndex(match);
      if (index >= 0) return received.splice(index, 1)[0];
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
  };
  const send = (message: JsonRpcMessage) => {
    window.dispatchEvent(new MessageEvent('message', { data: { jsonrpc: '2.0', ...message }, source: appWindow }));
  };

  return {
    send,
    request: (message: JsonRpcMessage) => {
      send(message);
      return next((reply) => reply.id === message.id && !reply.method);
    },
    next: (method: string) => next((message) => message.method === method),
  };
}
