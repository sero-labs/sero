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
