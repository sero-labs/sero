import type { ClientContext, ElicitRequest, ElicitRequestURLParams, ElicitResult } from '@modelcontextprotocol/client';
import { answerFormRequest } from './answer-form';
import { askToOpenPage, askUser, canAskUser, toWebUrl } from './ask-user';
import { plainText } from './form-questionnaire';
import { findRequestContext, type McpRequestContext } from './request-context';

/**
 * Handles every server input request for one server: legacy `elicitation/create`
 * requests and the input rounds of modern `input_required` results.
 */
export function createElicitationHandler(serverLabel: string) {
  return (request: ElicitRequest, ctx: ClientContext): Promise<ElicitResult> => (
    answerElicitation(serverLabel, request.params, ctx.mcpReq.signal)
  );
}

/** Answers one elicitation from a server. The Tasks path calls this too. */
export async function answerElicitation(
  serverLabel: string,
  params: ElicitRequest['params'],
  signal: AbortSignal,
): Promise<ElicitResult> {
  if (!canAskUser()) return { action: 'decline' };
  const context = findRequestContext(serverLabel);
  const source = ['MCP', serverLabel, context.toolName].filter(Boolean).join(' · ');
  if (params.mode === 'url') {
    return answerUrlRequest(params, serverLabel, source, context, signal);
  }
  const answer = await answerFormRequest(params, serverLabel, (questions) => askUser(questions, { source, signal }));
  if (answer.notice) context.notify?.(answer.notice);
  return answer.result;
}

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
  const choice = await askToOpenPage(url, { serverLabel, source, prompt: plainText(params.message), signal });
  if (choice === null) return { action: 'cancel' };
  return { action: choice === 'open' ? 'accept' : 'decline' };
}
