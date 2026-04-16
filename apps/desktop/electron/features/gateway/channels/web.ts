/**
 * Legacy basic web chat fallback for the Sero gateway.
 *
 * The bundled web remote SPA (`web-dist/`) is the primary UI owner.
 * This server keeps a minimal `/basic` fallback for diagnostics and
 * redirects `/` to the SPA served by the gateway on port 18800.
 */

import http from 'http';

export interface WebChatConfig {
  /** Port for the legacy fallback web UI. Default: 18801. */
  port: number;
  /** Bind host. Default: '127.0.0.1'. */
  host: string;
  /** Gateway WebSocket URL for fallback clients to connect to. */
  gatewayWsUrl: string;
}

function toGatewayHttpUrl(gatewayWsUrl: string): string | null {
  try {
    const url = new URL(gatewayWsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export class WebChatServer {
  private server: http.Server | null = null;
  private config: WebChatConfig;
  private gatewayHttpUrl: string | null;

  constructor(config: WebChatConfig) {
    this.config = config;
    this.gatewayHttpUrl = toGatewayHttpUrl(config.gatewayWsUrl);
  }

  async start(): Promise<void> {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      // Security: prevent token leakage via Referer headers
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      if (req.url === '/' || req.url === '/index.html') {
        if (this.gatewayHttpUrl) {
          res.writeHead(307, { Location: this.gatewayHttpUrl });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.buildHtml());
        return;
      }

      if (req.url === '/basic' || req.url === '/basic/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.buildHtml());
        return;
      }

      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        console.log(
          `[web-chat] Fallback UI available at http://${this.config.host}:${this.config.port}/basic (root redirects to gateway SPA)`,
        );
        resolve();
      });
      this.server!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise<void>((resolve) => {
      this.server!.close(() => {
        this.server = null;
        console.log('[web-chat] Server stopped');
        resolve();
      });
    });
  }

  /** Build the chat UI HTML. Public so the gateway can embed it. */
  buildHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sero Remote (Basic Fallback)</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0d1117; color: #c9d1d9; height: 100vh; display: flex; flex-direction: column;
  }
  header {
    padding: 12px 16px; background: #161b22; border-bottom: 1px solid #30363d;
    display: flex; align-items: center; gap: 12px;
  }
  header h1 { font-size: 16px; font-weight: 600; }
  #status { font-size: 12px; padding: 2px 8px; border-radius: 12px; }
  .connected { background: #238636; color: white; }
  .disconnected { background: #da3633; color: white; }
  .connecting { background: #d29922; color: black; }
  #messages {
    flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px;
  }
  .msg { padding: 8px 12px; border-radius: 8px; max-width: 80%; word-wrap: break-word; white-space: pre-wrap; }
  .msg.user { background: #1f6feb; color: white; align-self: flex-end; }
  .msg.agent { background: #21262d; border: 1px solid #30363d; align-self: flex-start; }
  .msg.tool { background: #1c1e23; border-left: 3px solid #8b949e; font-size: 13px; color: #8b949e; align-self: flex-start; font-family: monospace; }
  .msg.system { background: transparent; color: #8b949e; font-size: 13px; text-align: center; align-self: center; }
  #input-area {
    padding: 12px 16px; background: #161b22; border-top: 1px solid #30363d;
    display: flex; gap: 8px;
  }
  #input {
    flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 8px;
    padding: 10px 14px; color: #c9d1d9; font-size: 14px; outline: none; resize: none;
    font-family: inherit; min-height: 42px; max-height: 120px;
  }
  #input:focus { border-color: #1f6feb; }
  #send {
    background: #238636; color: white; border: none; border-radius: 8px;
    padding: 10px 20px; font-size: 14px; cursor: pointer; font-weight: 500;
  }
  #send:hover { background: #2ea043; }
  #send:disabled { background: #21262d; color: #484f58; cursor: not-allowed; }
  #auth-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex;
    align-items: center; justify-content: center; z-index: 100;
  }
  #auth-box {
    background: #161b22; border: 1px solid #30363d; border-radius: 12px;
    padding: 24px; width: 360px; display: flex; flex-direction: column; gap: 12px;
  }
  #auth-box h2 { font-size: 18px; }
  #auth-box input {
    background: #0d1117; border: 1px solid #30363d; border-radius: 8px;
    padding: 10px 14px; color: #c9d1d9; font-size: 14px; outline: none;
  }
  #auth-box button { background: #238636; color: white; border: none; border-radius: 8px; padding: 10px; font-size: 14px; cursor: pointer; }
</style>
</head>
<body>
<header>
  <h1>Sero Remote (Basic)</h1>
  <span id="status" class="disconnected">Disconnected</span>
</header>
<div id="messages"></div>
<div id="input-area">
  <textarea id="input" placeholder="Send a message..." rows="1"></textarea>
  <button id="send" disabled>Send</button>
</div>
<div id="auth-overlay">
  <div id="auth-box">
    <h2>Connect to Sero (Basic Fallback)</h2>
    <p style="color:#8b949e;font-size:13px">This minimal fallback is kept for diagnostics. The primary UI is the bundled web remote SPA.</p>
    <input id="token-input" type="password" placeholder="Auth token" autofocus>
    <button id="auth-btn">Connect</button>
  </div>
</div>
<script>
// Auto-detect the gateway WS URL from the page's own origin.
// When served from the gateway port (18800) or via Tailscale,
// the WS server is on the same host:port. When served from the
// standalone web chat port (18801), use the configured URL.
const GW_URL = (function() {
  const loc = location;
  const isStandalonePort = loc.port === '${this.config.port}';
  if (isStandalonePort) return '${this.config.gatewayWsUrl}';
  const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return wsProto + '//' + loc.host;
})();
let ws = null;
// Security: never read token from URL query string — it leaks via
// Referer headers, browser history, and server logs. Users must enter
// the token via the auth overlay password field.
let token = '';
let sessionId = 'web-' + Date.now();
let workspaceId = '';
let currentAgentMsg = null;

const $ = (sel) => document.querySelector(sel);
const msgs = $('#messages');
const input = $('#input');
const sendBtn = $('#send');
const statusEl = $('#status');
const authOverlay = $('#auth-overlay');

function addMsg(text, cls) {
  const div = document.createElement('div');
  div.className = 'msg ' + cls;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function updateStatus(state) {
  statusEl.textContent = state.charAt(0).toUpperCase() + state.slice(1);
  statusEl.className = state;
  sendBtn.disabled = state !== 'connected';
}

function connect() {
  if (ws) ws.close();
  updateStatus('connecting');
  ws = new WebSocket(GW_URL);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'connect', token, clientType: 'web' }));
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'ok' && msg.requestType === 'connect') {
      updateStatus('connected');
      addMsg('Connected to Sero gateway.', 'system');
      // Request workspace list
      ws.send(JSON.stringify({ type: 'list_workspaces' }));
    } else if (msg.type === 'ok' && msg.requestType === 'list_workspaces') {
      const wsList = msg.data || [];
      if (wsList.length > 0) {
        workspaceId = wsList[0].id;
        addMsg('Workspace: ' + wsList[0].name + ' (' + wsList[0].path + ')', 'system');
      }
    } else if (msg.type === 'error') {
      addMsg('Error: ' + msg.message, 'system');
      if (msg.requestType === 'connect') {
        updateStatus('disconnected');
        authOverlay.style.display = 'flex';
      }
    } else if (msg.type === 'text_delta') {
      if (!currentAgentMsg) currentAgentMsg = addMsg('', 'agent');
      currentAgentMsg.textContent += msg.delta;
      msgs.scrollTop = msgs.scrollHeight;
    } else if (msg.type === 'agent_start') {
      currentAgentMsg = null;
    } else if (msg.type === 'agent_end') {
      currentAgentMsg = null;
    } else if (msg.type === 'tool_start') {
      addMsg('Tool: ' + msg.toolName, 'tool');
    } else if (msg.type === 'tool_end') {
      if (msg.output) {
        const preview = msg.output.length > 200 ? msg.output.slice(0, 200) + '...' : msg.output;
        addMsg(preview, 'tool');
      }
    }
  };

  ws.onclose = () => {
    updateStatus('disconnected');
    setTimeout(() => { if (token) connect(); }, 3000);
  };

  ws.onerror = () => updateStatus('disconnected');
}

function sendMessage() {
  const text = input.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  addMsg(text, 'user');
  ws.send(JSON.stringify({
    type: 'prompt',
    workspaceId,
    sessionId,
    text
  }));
  input.value = '';
  input.style.height = 'auto';
}

// Auth — always require manual token entry via the overlay
$('#auth-btn').onclick = () => {
  token = $('#token-input').value.trim();
  if (token) {
    authOverlay.style.display = 'none';
    connect();
  }
};
$('#token-input').onkeydown = (e) => { if (e.key === 'Enter') $('#auth-btn').click(); };

// Input handling
sendBtn.onclick = sendMessage;
input.onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
};
input.oninput = () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
};
</script>
</body>
</html>`;
  }
}
