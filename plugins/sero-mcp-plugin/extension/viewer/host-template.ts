import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { UiResourceContent, UiToolInfo } from './types';

// Keep this aligned with the desktop host version until the shell exposes a
// runtime version constant to plugin extensions.
const SERO_HOST_VERSION = '0.1.0';

export function buildHostHtmlTemplate(input: {
  sessionId: string;
  serverName: string;
  resourceUri: string;
  title: string;
  allowAttribute: string;
  toolArgs: Record<string, unknown>;
  toolInfo?: UiToolInfo;
}): string {
  const hostContext = buildHostContext(input.toolInfo);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1115;
      --surface: #181c22;
      --text: #ecf0f5;
      --muted: #98a2b3;
      --border: rgba(255,255,255,0.12);
      --danger: #f87171;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { display: flex; flex-direction: column; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--surface); }
    .title { min-width: 0; }
    .label { display: block; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
    .name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600; }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .badge { border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; font-size: 11px; color: var(--muted); }
    .badge.error { border-color: color-mix(in srgb, var(--danger) 35%, var(--border) 65%); color: var(--danger); }
    main { flex: 1; min-height: 0; padding: 10px; }
    iframe { width: 100%; height: 100%; min-height: 520px; border: 1px solid var(--border); border-radius: 10px; background: white; }
  </style>
</head>
<body>
  <header>
    <div class="title">
      <span class="label">MCP interactive UI</span>
      <span class="name">${escapeHtml(input.title)}</span>
    </div>
    <div class="badges">
      <span class="badge">${escapeHtml(input.serverName)}</span>
      <span class="badge">${escapeHtml(input.resourceUri)}</span>
      <span class="badge" id="status-badge">connecting</span>
    </div>
  </header>
  <main>
    <iframe id="mcp-ui" referrerpolicy="no-referrer"></iframe>
  </main>
  <script>
    const SESSION_ID = ${safeInlineJson(input.sessionId)};
    const TOOL_ARGS = ${safeInlineJson(input.toolArgs)};
    const HOST_CONTEXT = ${safeInlineJson(hostContext)};
    const ALLOW_ATTRIBUTE = ${safeInlineJson(input.allowAttribute)};
    const iframe = document.getElementById('mcp-ui');
    const statusBadge = document.getElementById('status-badge');
    const hostInfo = { name: 'Sero', version: ${safeInlineJson(SERO_HOST_VERSION)} };
    const hostCapabilities = {
      openLinks: {},
      downloadFile: {},
      serverTools: { listChanged: false },
      serverResources: { listChanged: false },
      updateModelContext: {},
      message: {},
    };

    const setStatus = (label, isError = false) => {
      statusBadge.textContent = label;
      statusBadge.classList.toggle('error', isError);
    };

    const post = async (path, params) => {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: SESSION_ID, params }),
      });
      const body = await response.json().catch(() => ({ ok: false, error: 'Invalid JSON response' }));
      if (!response.ok || !body.ok) {
        throw new Error(body.error || ('HTTP ' + response.status));
      }
      return body.result ?? {};
    };

    const sendResult = (id, result) => {
      iframe.contentWindow?.postMessage({ jsonrpc: '2.0', id, result }, '*');
    };

    const sendError = (id, message, code = -32000) => {
      iframe.contentWindow?.postMessage({ jsonrpc: '2.0', id, error: { code, message } }, '*');
    };

    const sendNotification = (method, params) => {
      iframe.contentWindow?.postMessage({ jsonrpc: '2.0', method, params }, '*');
    };

    const handleJsonRpc = async (message) => {
      const method = typeof message.method === 'string' ? message.method : '';
      const params = message.params;
      const id = Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : undefined;
      const isRequest = id !== undefined;

      try {
        if (method === 'ui/initialize' && isRequest) {
          sendResult(id, { protocolVersion: ${safeInlineJson(LATEST_PROTOCOL_VERSION)}, hostInfo, hostCapabilities, hostContext: HOST_CONTEXT });
          return;
        }
        if (method === 'ping' && isRequest) {
          sendResult(id, {});
          return;
        }
        if (method === 'ui/notifications/initialized') {
          setStatus('connected');
          sendNotification('ui/notifications/tool-input', { arguments: TOOL_ARGS });
          return;
        }
        if (method === 'ui/notifications/size-changed') {
          if (params && typeof params === 'object') {
            const height = typeof params.height === 'number' ? Math.max(params.height, 320) : null;
            if (height) {
              iframe.style.height = height + 'px';
            }
          }
          return;
        }
        if (!isRequest) {
          return;
        }

        if (method === 'tools/call') {
          sendResult(id, await post('/proxy/tools/call', params));
          return;
        }
        if (method === 'tools/list') {
          sendResult(id, await post('/proxy/tools/list', params));
          return;
        }
        if (method === 'resources/list') {
          sendResult(id, await post('/proxy/resources/list', params));
          return;
        }
        if (method === 'resources/templates/list') {
          sendResult(id, await post('/proxy/resources/templates/list', params));
          return;
        }
        if (method === 'resources/read') {
          sendResult(id, await post('/proxy/resources/read', params));
          return;
        }
        if (method === 'prompts/list') {
          sendResult(id, await post('/proxy/prompts/list', params));
          return;
        }
        if (method === 'ui/message') {
          await post('/proxy/ui/message', params);
          sendResult(id, {});
          return;
        }
        if (method === 'ui/update-model-context') {
          await post('/proxy/ui/context', params);
          sendResult(id, {});
          return;
        }
        if (method === 'ui/open-link') {
          if (params && typeof params.url === 'string') {
            window.open(params.url, '_blank', 'noopener,noreferrer');
          }
          sendResult(id, { isError: false });
          return;
        }
        if (method === 'ui/download-file') {
          sendResult(id, { isError: true });
          return;
        }
        if (method === 'ui/request-display-mode') {
          sendResult(id, { mode: 'inline' });
          return;
        }
        if (method === 'ui/resource-teardown') {
          sendResult(id, {});
          return;
        }

        sendError(id, 'Method not found', -32601);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus('error', true);
        sendError(id, message);
      }
    };

    window.addEventListener('message', (event) => {
      if (event.source !== iframe.contentWindow) {
        return;
      }
      const payload = event.data;
      if (!payload || typeof payload !== 'object') {
        return;
      }
      if (payload.jsonrpc === '2.0' && typeof payload.method === 'string') {
        void handleJsonRpc(payload);
        return;
      }
      const messageType = typeof payload.type === 'string' ? payload.type : '';
      if (!messageType || messageType.startsWith('ui-lifecycle-') || messageType.startsWith('ui-message-')) {
        return;
      }
      const forwarded = messageType === 'notify' || messageType === 'prompt' || messageType === 'intent' || messageType === 'message'
        ? { ...payload }
        : { type: 'intent', intent: messageType, params: payload.payload && typeof payload.payload === 'object' ? payload.payload : {} };
      void post('/proxy/ui/message', forwarded).catch(() => {
        setStatus('error', true);
      });
    });

    if (ALLOW_ATTRIBUTE) {
      iframe.setAttribute('allow', ALLOW_ATTRIBUTE);
    }
    // Deliberately omit allow-same-origin so embedded MCP UIs cannot reach back
    // into the host frame directly; they must go through the AppBridge-style
    // postMessage contract exposed by this viewer shell.
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-downloads');
    iframe.src = '/ui-app?session=' + encodeURIComponent(SESSION_ID);
  </script>
</body>
</html>`;
}

export function buildViewerHostCspContent(): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self'",
    "font-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export function buildCspMetaContent(csp: UiResourceContent['meta']['csp']): string | undefined {
  if (!csp) {
    return undefined;
  }

  const directives = ["default-src 'none'"];
  pushDirective(directives, 'script-src', csp.scriptDomains);
  pushDirective(directives, 'style-src', csp.styleDomains);
  pushDirective(directives, 'font-src', csp.fontDomains);
  pushDirective(directives, 'img-src', csp.imgDomains);
  pushDirective(directives, 'media-src', csp.mediaDomains);
  pushDirective(directives, 'connect-src', csp.connectDomains);
  pushDirective(directives, 'frame-src', csp.frameDomains);
  pushDirective(directives, 'worker-src', csp.workerDomains);
  pushDirective(directives, 'base-uri', csp.baseUriDomains);
  return directives.join('; ');
}

export function applyCspMeta(html: string, cspContent: string | undefined): string {
  if (!cspContent || /http-equiv=["']Content-Security-Policy["']/i.test(html)) {
    return html;
  }
  const metaTag = `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(cspContent)}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n${metaTag}`);
  }
  return `${metaTag}\n${html}`;
}

function buildHostContext(toolInfo: UiToolInfo | undefined): Record<string, unknown> {
  if (!toolInfo) {
    return { platform: 'desktop', displayMode: 'inline', availableDisplayModes: ['inline'] };
  }

  return {
    platform: 'desktop',
    displayMode: 'inline',
    availableDisplayModes: ['inline'],
    toolInfo: {
      tool: {
        name: toolInfo.name,
        description: toolInfo.description,
        inputSchema: isRecord(toolInfo.inputSchema) ? toolInfo.inputSchema : { type: 'object', properties: {} },
      },
    },
  };
}

function pushDirective(target: string[], name: string, values: string[] | undefined): void {
  if (!values || values.length === 0) {
    return;
  }
  target.push(`${name} ${values.join(' ')}`);
}

function safeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
