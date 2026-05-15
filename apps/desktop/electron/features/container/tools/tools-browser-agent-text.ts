import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import type { AgentBrowserJson, AgentCommandOptions } from './tools-browser-agent-types';

export function textSelectorValue(selector: string): string | null {
  const match = selector.match(/^text=(.*)$/i);
  return match ? match[1]?.trim() ?? '' : null;
}

function clickByTextExpression(text: string): string {
  return `(() => {
    const wanted = ${JSON.stringify(text)}.trim().toLowerCase();
    const normalise = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const candidates = Array.from(document.querySelectorAll('a,button,[role="button"],[role="link"],summary,[onclick],input[type="button"],input[type="submit"]'))
      .filter(visible);
    const textOf = (el) => normalise(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('value'));
    const target = candidates.find((el) => textOf(el).toLowerCase() === wanted)
      || candidates.find((el) => textOf(el).toLowerCase().includes(wanted));
    if (!target) return { ok: false, error: 'No visible clickable element with text: ' + ${JSON.stringify(text)} };
    target.scrollIntoView({ block: 'center', inline: 'center' });
    target.click();
    return { ok: true, text: textOf(target), url: location.href };
  })()`;
}

export async function clickByText(opts: {
  runtime: RuntimeBackend;
  workspaceId: string;
  executablePath: string | null;
  text: string;
  runEval: (
    runtime: RuntimeBackend,
    workspaceId: string,
    executablePath: string | null,
    expression: string,
    options?: AgentCommandOptions,
  ) => Promise<AgentBrowserJson>;
}): Promise<AgentBrowserJson> {
  const { runtime, workspaceId, executablePath, text, runEval } = opts;
  const response = await runEval(runtime, workspaceId, executablePath, clickByTextExpression(text));
  const result = response.result as { ok?: boolean; error?: string } | undefined;
  if (result?.ok === false) throw new Error(result.error || `No visible clickable element with text: ${text}`);
  return response;
}
