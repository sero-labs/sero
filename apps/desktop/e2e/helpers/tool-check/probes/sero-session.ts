import type { StepContext, ToolCallResult, ToolProbe } from '../types';
import { expectText } from '../expect';

/**
 * A chat knows itself. A subagent or Workflow step is not a chat, and
 * "No active agent session." is its normal answer (session-tools.contract.spec.ts).
 */
export function expectSessionInfo(result: ToolCallResult, ctx: StepContext): void {
  expectText(result, `Workspace: ${ctx.workspaceId}`);
  const isChat = ctx.site === 'chat' || ctx.site === 'codemode-chat';
  expectText(result, isChat ? 'Session ID:' : 'No active agent session.');
}

export const seroSessionProbe: ToolProbe = {
  tool: 'sero session',
  steps: [{ action: 'info', params: { argv: ['info'] }, expect: expectSessionInfo }],
};
