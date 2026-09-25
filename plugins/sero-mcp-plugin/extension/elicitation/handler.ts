import type { ClientContext, ElicitRequest, ElicitResult } from '@modelcontextprotocol/client';
import { answerFormRequest } from './answer-form';
import { askUser, canAskUser } from './ask-user';
import { findRequestContext } from './request-context';

/**
 * Handles every server input request for one server: legacy `elicitation/create`
 * requests and the input rounds of modern `input_required` results.
 */
export function createElicitationHandler(serverLabel: string) {
  return async (request: ElicitRequest, ctx: ClientContext): Promise<ElicitResult> => {
    if (!canAskUser()) return { action: 'decline' };
    const params = request.params;
    const context = findRequestContext(serverLabel);
    if (params.mode === 'url') {
      context.notify?.(`Sero declined a request from ${serverLabel} to open a web page. Sero does not open server pages yet.`);
      return { action: 'decline' };
    }
    const source = ['MCP', serverLabel, context.toolName].filter(Boolean).join(' · ');
    const answer = await answerFormRequest(params, serverLabel, (questions) => askUser(questions, {
      source,
      signal: ctx.mcpReq.signal,
    }));
    if (answer.notice) context.notify?.(answer.notice);
    return answer.result;
  };
}
