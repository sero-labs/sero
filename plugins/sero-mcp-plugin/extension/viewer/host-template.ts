import { VIEWER_SHELL_CONFIG_ID, VIEWER_SHELL_SCRIPT, type ViewerShellConfig } from '../../shared/viewer-shell';
import type { UiResourceContent, UiToolInfo } from './types';

/** The viewer page: the app frame, one status line, and the bundled shell script. */
export function buildHostHtmlTemplate(input: {
  title: string;
  token: string;
  allowAttribute: string;
  toolArgs: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  toolInfo?: UiToolInfo;
}): string {
  const config: ViewerShellConfig = {
    token: input.token,
    allowAttribute: input.allowAttribute,
    toolArgs: input.toolArgs,
    toolResult: input.toolResult,
    hostContext: buildHostContext(input.toolInfo),
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    :root { color-scheme: light dark; }
    html, body { margin: 0; background: transparent; font: 12px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    iframe { display: block; width: 100%; height: 320px; border: 0; background: white; }
    #status { display: flex; margin: 0; padding: 5px 10px; border-top: 1px solid rgba(127,127,127,0.25); color: #a1a1aa; }
    #status[hidden] { display: none; }
    #status.error { color: #f87171; }
  </style>
</head>
<body>
  <div id="app"></div>
  <p id="status" role="status" hidden></p>
  <script type="application/json" id="${VIEWER_SHELL_CONFIG_ID}">${safeInlineJson(config)}</script>
  <script type="module" src="/${VIEWER_SHELL_SCRIPT}"></script>
</body>
</html>`;
}

export function buildViewerHostCspContent(): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'unsafe-inline'",
    "connect-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/**
 * The CSP of the app frame. Without declared domains the app has no network
 * access; declared domains open only their own directives. Inline script and
 * style stay allowed, because an MCP app is usually one HTML document.
 */
export function buildAppCsp(csp: UiResourceContent['meta']['csp']): string {
  const sources = (values: string[] | undefined, fallback: string) => {
    const safe = (values ?? []).filter(isCspSource);
    return safe.length > 0 ? safe.join(' ') : fallback;
  };
  const resources = sources(csp?.resourceDomains, '');
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${resources}`,
    `style-src 'unsafe-inline' ${resources}`,
    `img-src data: blob: ${resources}`,
    `font-src data: ${resources}`,
    `media-src data: blob: ${resources}`,
    `connect-src ${sources(csp?.connectDomains, "'none'")}`,
    `frame-src ${sources(csp?.frameDomains, "'none'")}`,
    `base-uri ${sources(csp?.baseUriDomains, "'none'")}`,
    "object-src 'none'",
    "form-action 'none'",
  ].map((directive) => directive.trim()).join('; ');
}

/** A web origin, optionally with a wildcard subdomain. Anything else could change the policy. */
function isCspSource(value: string): boolean {
  return /^(https?|wss?):\/\/(\*\.)?[a-z0-9.-]+(:\d+)?$/i.test(value);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
