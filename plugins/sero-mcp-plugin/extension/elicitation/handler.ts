import type { ClientContext, ElicitRequest, ElicitRequestURLParams, ElicitResult } from '@modelcontextprotocol/client';
import { answerFormRequest } from './answer-form';
import { askUser, canAskUser } from './ask-user';
import { plainText } from './form-questionnaire';
import { findRequestContext, type McpRequestContext } from './request-context';

/**
 * Handles every server input request for one server: legacy `elicitation/create`
 * requests and the input rounds of modern `input_required` results.
 */
export function createElicitationHandler(serverLabel: string) {
  return async (request: ElicitRequest, ctx: ClientContext): Promise<ElicitResult> => {
    if (!canAskUser()) return { action: 'decline' };
    const params = request.params;
    const context = findRequestContext(serverLabel);
    const source = ['MCP', serverLabel, context.toolName].filter(Boolean).join(' · ');
    if (params.mode === 'url') {
      return answerUrlRequest(params, serverLabel, source, context, ctx.mcpReq.signal);
    }
    const answer = await answerFormRequest(params, serverLabel, (questions) => askUser(questions, {
      source,
      signal: ctx.mcpReq.signal,
    }));
    if (answer.notice) context.notify?.(answer.notice);
    return answer.result;
  };
}

function toWebUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Shows the full URL with Decline and Open page. The host opens the page only when the user picks Open page. */
async function answerUrlRequest(
  params: ElicitRequestURLParams,
  serverLabel: string,
  source: string,
  context: McpRequestContext,
  signal: AbortSignal,
): Promise<ElicitResult> {
  const url = toWebUrl(params.url);
  if (!url) {
    context.notify?.(`Sero declined a request from ${serverLabel} to open a page that is not a web address.`);
    return { action: 'decline' };
  }
  const answers = await askUser([{
    id: 'open-page',
    label: `Open a page from ${serverLabel}?`,
    prompt: [plainText(params.message), url].filter(Boolean).join('\n\n'),
    options: [
      { value: 'decline', label: 'Decline', emphasis: 'primary' },
      { value: 'open', label: 'Open page', openUrl: url },
    ],
    allowOther: false,
  }], { source, signal, type: 'question' });
  if (answers === null) return { action: 'cancel' };
  return { action: answers[0]?.value === 'open' ? 'accept' : 'decline' };
}
