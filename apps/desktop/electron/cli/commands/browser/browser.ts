/**
 * `sero browser` — lets the agent drive the in-app web browser directly,
 * without going through a plugin extension.
 *
 * Registered straight onto the CliRegistry (the same surface that
 * `pi.registerTool` ultimately funnels into for plugins). This is the
 * intended path for built-in host features: plugins get the `registerTool`
 * convenience; the host owns the registry.
 *
 * Subcommands:
 *   list [--all]                List loaded tabs (default: current workspace)
 *   open <url>                  Open a new tab in the current workspace
 *   goto <url>                  Navigate the active tab, or open one if needed
 *   close <tab-id>              Close a tab
 *   navigate <tab-id> <url>     Point an existing tab at a new URL
 *   get-text [--tab <id>]       Extract title + plain text from the tab
 *   screenshot [--tab <id>]     Return a PNG of the tab as an image block
 *
 * Tab ids for `get-text` / `screenshot` default to the active tab of the
 * invoking workspace. If no tab is active and no --tab is supplied, the
 * command fails — the agent can list first and pick.
 */

import { browserViewManager } from '@electron/features/browser/view-manager';
import type { CliRegistry } from '@electron/cli/core/registry';
import type { CliCommandContext, CliResult } from '@electron/cli/core/types';
import { fail, ok, parseFlags } from '@electron/cli/lib/utils';

/**
 * Resolve an agent-supplied tab reference to a concrete id, enforcing
 * workspace ownership. An explicit `--tab <id>` is accepted only if the
 * tab actually belongs to the invoking workspace — otherwise an agent
 * that learned a tab id through `list --all` could reach across workspace
 * boundaries.
 */
function resolveTabId(
  explicit: string | undefined,
  ctx: CliCommandContext,
): { tabId: string } | { error: string } {
  if (explicit) {
    const owner = browserViewManager.workspaceForTab(explicit);
    if (!owner) {
      return { error: `Unknown or unloaded tab: ${explicit}` };
    }
    if (owner !== ctx.workspaceId) {
      return {
        error:
          `Tab ${explicit} belongs to workspace "${owner}", not the current ` +
          `workspace "${ctx.workspaceId}". Switch workspaces to access it.`,
      };
    }
    return { tabId: explicit };
  }
  const active = browserViewManager.resolveActiveTabForWorkspace(ctx.workspaceId);
  if (!active) {
    return {
      error:
        `No active tab in workspace "${ctx.workspaceId}". ` +
        `Run 'sero browser list' to see loaded tabs or 'sero browser open <url>' first.`,
    };
  }
  return { tabId: active };
}

function formatTabRow(info: {
  id: string;
  workspaceId: string;
  url: string;
  title: string;
  isActive: boolean;
}): string {
  const marker = info.isActive ? '● ' : '  ';
  const title = info.title || '(untitled)';
  return `${marker}${info.id}  [${info.workspaceId}]  ${title}\n    ${info.url}`;
}

async function handleBrowser(
  args: string[],
  ctx: CliCommandContext,
): Promise<CliResult> {
  const [action, ...rest] = args;
  const { positionals, flags } = parseFlags(rest);

  switch (action) {
    case undefined:
    case 'list': {
      const wantsAll = flags.get('all') === true;
      const list = browserViewManager.listLoadedTabs(
        wantsAll ? undefined : ctx.workspaceId,
      );
      if (list.length === 0) {
        return ok(
          wantsAll
            ? 'No tabs are currently loaded in any workspace.'
            : `No tabs are currently loaded in workspace "${ctx.workspaceId}". ` +
                `Use 'sero browser open <url>' to open one.`,
        );
      }
      const body = list.map(formatTabRow).join('\n');
      return ok(body);
    }

    case 'open': {
      const url = positionals[0];
      if (!url) return fail('Usage: sero browser open <url>');
      const tabId = browserViewManager.openTabForHost(url, ctx.workspaceId);
      if (!tabId) return fail(`Unsupported browser URL: ${url}. Use http(s) URLs only.`);
      return ok(`Opened tab ${tabId} in workspace "${ctx.workspaceId}" → ${url}`);
    }

    case 'goto': {
      const url = positionals[0];
      if (!url) return fail('Usage: sero browser goto <url>');
      const active = browserViewManager.resolveActiveTabForWorkspace(ctx.workspaceId);
      if (!active) {
        const tabId = browserViewManager.openTabForHost(url, ctx.workspaceId);
        if (!tabId) return fail(`Unsupported browser URL: ${url}. Use http(s) URLs only.`);
        return ok(`Opened tab ${tabId} in workspace "${ctx.workspaceId}" → ${url}`);
      }
      browserViewManager.navigate(active, url, ctx.workspaceId);
      return ok(`Navigating active tab ${active} → ${url}`);
    }

    case 'close': {
      const tabId = positionals[0];
      if (!tabId) return fail('Usage: sero browser close <tab-id>');
      // closeTabForHost now enforces workspace ownership itself; check first
      // so we can return a precise error instead of a silent no-op.
      const owner = browserViewManager.workspaceForTab(tabId);
      if (!owner) return fail(`Unknown or already-closed tab: ${tabId}`);
      if (owner !== ctx.workspaceId) {
        return fail(
          `Tab ${tabId} belongs to workspace "${owner}", not "${ctx.workspaceId}". ` +
            `Refusing to close.`,
        );
      }
      if (!browserViewManager.closeTabForHost(tabId, ctx.workspaceId)) {
        return fail(`Failed to close tab ${tabId}`);
      }
      return ok(`Closed tab ${tabId}`);
    }

    case 'navigate': {
      const tabId = positionals[0];
      const url = positionals[1];
      if (!tabId || !url) return fail('Usage: sero browser navigate <tab-id> <url>');
      const owner = browserViewManager.workspaceForTab(tabId);
      if (!owner) return fail(`Unknown or unloaded tab: ${tabId}`);
      if (owner !== ctx.workspaceId) {
        return fail(
          `Tab ${tabId} belongs to workspace "${owner}", not "${ctx.workspaceId}". ` +
            `Refusing to navigate.`,
        );
      }
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return fail(`Unsupported browser URL: ${url}. Use http(s) URLs only.`);
        }
      } catch {
        return fail(`Not a valid URL: ${url}`);
      }
      browserViewManager.navigate(tabId, url, ctx.workspaceId);
      return ok(`Navigating tab ${tabId} → ${url}`);
    }

    case 'get-text': {
      const resolved = resolveTabId(
        typeof flags.get('tab') === 'string' ? (flags.get('tab') as string) : undefined,
        ctx,
      );
      if ('error' in resolved) return fail(resolved.error);
      const page = await browserViewManager.extractPage(resolved.tabId, ctx.workspaceId);
      if (!page) return fail(`Failed to extract text from tab ${resolved.tabId}`);
      const header = page.title
        ? `# ${page.title}\n\n_${page.url}_\n\n`
        : `_${page.url}_\n\n`;
      return ok(`${header}${page.text}`);
    }

    case 'screenshot': {
      const resolved = resolveTabId(
        typeof flags.get('tab') === 'string' ? (flags.get('tab') as string) : undefined,
        ctx,
      );
      if ('error' in resolved) return fail(resolved.error);
      const base64 = await browserViewManager.capturePage(resolved.tabId, ctx.workspaceId);
      if (!base64) return fail(`Failed to capture tab ${resolved.tabId}`);
      return {
        output: `Captured tab ${resolved.tabId}`,
        exitCode: 0,
        content: [{ type: 'image', data: base64, mimeType: 'image/png' }],
      };
    }

    default:
      return fail(`Unknown browser action: ${action}`);
  }
}

export function registerBrowserCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'browser',
    summary: 'Drive the in-app web browser (list, open, close, navigate, get-text, screenshot)',
    help:
      'browser — Drive the in-app web browser\n\n' +
      'Usage: sero browser <action> [args]\n\n' +
      'Actions:\n' +
      '  list [--all]                 List loaded tabs in the current workspace (default)\n' +
      '                               or across all workspaces (--all)\n' +
      '  open <url>                   Open a new tab in the current workspace\n' +
      '  goto <url>                   Navigate the active tab, or open one if needed\n' +
      '  close <tab-id>               Close a tab\n' +
      '  navigate <tab-id> <url>      Point an existing tab at a new URL\n' +
      '  get-text [--tab <id>]        Extract the page as title + plain text. Defaults\n' +
      '                               to the active tab of the current workspace.\n' +
      '  screenshot [--tab <id>]      Return a PNG of the tab as an image block. Defaults\n' +
      '                               to the active tab of the current workspace.\n\n' +
      'Tabs in a workspace share a persistent session partition (cookies/logins\n' +
      'isolated per workspace). Tabs only appear in `list` once their view has\n' +
      'been loaded — persisted tabs are loaded lazily when the user opens the\n' +
      'Browser panel.',
    source: 'ipc',
    group: 'Builtin',
    execute: handleBrowser,
  });
}
