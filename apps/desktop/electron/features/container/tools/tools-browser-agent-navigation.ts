/**
 * Navigation for the automation browser: how a page is opened, and what a
 * failed load wait means for the session that asked for it.
 */

import type { AgentBrowserJson, AgentCommandOptions } from './tools-browser-agent-types';

/** The browser's own load wait, which fails the whole command when its cap expires. */
const LOAD_STATE_TIMEOUT = /Timed out after \d+\s*ms waiting for load state/i;

export interface PageCommands {
  run(args: string[], options?: AgentCommandOptions): Promise<AgentBrowserJson>;
  evaluate(expression: string, options?: AgentCommandOptions): Promise<AgentBrowserJson>;
  closeSession(): Promise<void>;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isNavigationError(error: unknown): boolean {
  return /Page\.navigate|Navigation failed|ERR_|net::|timed out/i.test(errorMessage(error));
}

/**
 * The wait after a page is opened. `open` returns once the page has loaded, and
 * the browser's own `--load load` then waits for an event that has already
 * passed: measured at 25s on every call. The page's ready state is asked for
 * instead. `networkidle` has no such fault.
 */
function loadWaitArgs(waitUntil: string): string[] {
  return waitUntil === 'load' ? ['wait', '--fn', 'document.readyState === "complete"'] : ['wait', '--load', waitUntil];
}

/** `networkidle` never settles on a page that keeps polling, and the page is open either way. */
export async function waitForLoadState(commands: PageCommands, waitUntil: string): Promise<void> {
  await commands.run(loadWaitArgs(waitUntil), { execTimeoutMs: 30_000 }).catch((error: unknown) => {
    if (!LOAD_STATE_TIMEOUT.test(errorMessage(error))) throw error;
  });
}

/**
 * A page whose `load` event never fires has still navigated, and tearing the
 * session down throws that page away. `open` reports the cap as a failure, so
 * the document itself decides whether the navigation happened.
 */
async function reportTimedOutPage(commands: PageCommands, targetUrl: string, message: string): Promise<AgentBrowserJson> {
  const probe = await commands.evaluate(
    '(() => ({ title: document.title, url: location.href, readyState: document.readyState }))()',
    { execTimeoutMs: 10_000 },
  ).catch(() => null);
  const page = probe?.result as { title?: string; url?: string; readyState?: string } | undefined;
  if (!page?.url || page.url === 'about:blank') {
    return { success: false, warning: `Navigation to ${targetUrl} did not finish loading: ${message}`, url: 'about:blank' };
  }
  return {
    title: page.title,
    url: page.url,
    warning: `The page did not finish loading within the browser's limit (readyState: ${page.readyState ?? 'unknown'}), so this is what rendered: ${message}`,
  };
}

export async function openBrowserUrl(commands: PageCommands, targetUrl: string): Promise<AgentBrowserJson> {
  try {
    return await commands.run(['open', targetUrl]);
  } catch (error) {
    const message = errorMessage(error);
    if (LOAD_STATE_TIMEOUT.test(message)) return reportTimedOutPage(commands, targetUrl, message);
    if (!isNavigationError(error)) throw error;
    await commands.closeSession();
    await commands.run(['open', 'about:blank']).catch(() => undefined);
    return { success: false, warning: `Navigation to ${targetUrl} failed and the browser session was reset: ${message}`, url: 'about:blank' };
  }
}
