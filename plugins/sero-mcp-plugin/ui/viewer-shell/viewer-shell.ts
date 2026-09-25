// The host page of an MCP app viewer. The plugin's Vite build bundles this file
// to dist/ui/viewer-shell.js, and the viewer server serves it. It connects the
// sandboxed app frame to Sero through the official AppBridge, and sends each
// app request to the viewer server's proxy routes.
import {
  AppBridge,
  PostMessageTransport,
  type McpUiHostCapabilities,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import type { CallToolResult } from '@modelcontextprotocol/client';
import { VIEWER_SHELL_CONFIG_ID, type ViewerShellConfig, type ViewerSizeMessage } from '../../shared/viewer-shell';

const HOST_INFO = { name: 'Sero', version: '0.1.0' };

/** Only the capabilities that the viewer server implements. */
export const HOST_CAPABILITIES: McpUiHostCapabilities = {
  openLinks: {},
  serverTools: {},
  serverResources: {},
};

/** Added when the app is shown in a chat. */
export const CHAT_CAPABILITIES: McpUiHostCapabilities = {
  message: { text: {} },
  updateModelContext: { text: {}, structuredContent: {} },
};

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export interface ViewerShell {
  bridge: AppBridge;
  frame: HTMLIFrameElement;
}

export async function startViewerShell(doc: Document = document, fetchImpl: Fetch = fetch): Promise<ViewerShell> {
  const config = readConfig(doc);
  const status = doc.getElementById('status');
  // Tell the embedding window the page height, so it can fit its frame to the app and status line.
  const postHeight = () => {
    const message: ViewerSizeMessage = { type: 'sero-mcp-viewer-size', height: doc.documentElement.scrollHeight };
    doc.defaultView?.parent?.postMessage(message, '*');
  };
  const setStatus = (text: string, isError = false) => {
    if (!status) return;
    status.textContent = text;
    status.hidden = !text;
    status.classList.toggle('error', isError);
    postHeight();
  };

  const post = async <T>(path: string, params: unknown): Promise<T> => {
    const response = await fetchImpl(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: config.token, params }),
    });
    const body = await response.json().catch(() => ({ ok: false, error: 'Invalid JSON response' }));
    if (!response.ok || !body.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return (body.result ?? {}) as T;
  };

  const frame = doc.createElement('iframe');
  frame.title = 'MCP app';
  frame.referrerPolicy = 'no-referrer';
  // allow-same-origin gives the app its own real origin (the per-app loopback
  // host in the config), so APIs the user approved, such as camera and
  // microphone, can work. That origin differs from this shell and from every
  // other app, and the app URL carries no shell token.
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin');
  if (config.allowAttribute) frame.setAttribute('allow', config.allowAttribute);
  (doc.getElementById('app') ?? doc.body).append(frame);

  const capabilities = config.chat ? { ...HOST_CAPABILITIES, ...CHAT_CAPABILITIES } : HOST_CAPABILITIES;
  const bridge = new AppBridge(null, HOST_INFO, capabilities, {
    hostContext: config.hostContext as McpUiHostContext,
  });

  bridge.oncalltool = async (params) => {
    const result = await post<CallToolResult>('/proxy/tools/call', params);
    setStatus(result.isError ? firstText(result) : `App called ${params.name}`, result.isError === true);
    return result;
  };
  bridge.setRequestHandler('tools/list', (request) => post('/proxy/tools/list', request.params));
  bridge.onlistresources = (params) => post('/proxy/resources/list', params);
  bridge.onlistresourcetemplates = (params) => post('/proxy/resources/templates/list', params);
  bridge.onreadresource = (params) => post('/proxy/resources/read', params);
  bridge.onlistprompts = (params) => post('/proxy/prompts/list', params);
  bridge.onopenlink = (params) => post('/proxy/ui/open-link', params);
  if (config.chat) {
    bridge.onmessage = async (params) => {
      await post('/proxy/ui/message', params);
      return {};
    };
    bridge.onupdatemodelcontext = async (params) => {
      await post('/proxy/ui/context', params);
      return {};
    };
  }
  bridge.onsizechange = ({ height }) => {
    if (typeof height !== 'number') return;
    frame.style.height = `${height}px`;
    postHeight();
  };
  bridge.oninitialized = () => {
    void bridge.sendToolInput({ arguments: config.toolArgs });
    if (config.toolResult) void bridge.sendToolResult(config.toolResult as CallToolResult);
  };

  // The app loads asynchronously, so the bridge listens before the app can send its first message.
  frame.src = config.appFrameUrl;
  const appWindow = frame.contentWindow;
  if (!appWindow) throw new Error('The app frame has no window.');
  await bridge.connect(new PostMessageTransport(appWindow, appWindow));
  return { bridge, frame };
}

function readConfig(doc: Document): ViewerShellConfig {
  const text = doc.getElementById(VIEWER_SHELL_CONFIG_ID)?.textContent;
  if (!text) throw new Error('The viewer page has no configuration.');
  try {
    return JSON.parse(text) as ViewerShellConfig;
  } catch {
    throw new Error('The viewer page configuration is not valid JSON.');
  }
}

function firstText(result: CallToolResult): string {
  const block = result.content.find((item) => item.type === 'text');
  return block && 'text' in block ? block.text : 'The tool call failed.';
}
