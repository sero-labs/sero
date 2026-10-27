/**
 * Scripted turns for the sessions a Room or an Architect project opens. The
 * stub model sees the whole history on every request, so a turn is stepped
 * through by counting the tool results that came back after its last user
 * message.
 */
import type { StubMessage, StubReply, StubRequest } from '../../stub-model';
import { cliCommandFor } from '../command-line';

export interface ScriptedCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** A call to one plugin tool or command through `sero-cli`, as a member runs it. */
export function cliCall(tool: string, params: Record<string, unknown>): ScriptedCall {
  return { name: 'sero-cli', arguments: { command: cliCommandFor(tool, params) } };
}

export function userMessages(request: StubRequest): StubMessage[] {
  return request.messages.filter((message) => message.role === 'user');
}

/** The text of the newest user message, which is the turn being answered. */
export function lastUserText(request: StubRequest): string {
  return userMessages(request).at(-1)?.text ?? '';
}

/** Everything a request says about who the session is: its system prompt and its first message. */
export function identityText(request: StubRequest): string {
  return `${request.system}\n${userMessages(request)[0]?.text ?? ''}`;
}

/** How many tool results the current turn has had so far. */
export function resultsThisTurn(request: StubRequest): number {
  const lastUser = request.messages.map((message) => message.role).lastIndexOf('user');
  return request.messages.slice(lastUser + 1).filter((message) => message.role === 'tool').length;
}

/** The text of a tool result in the current turn, by position. */
export function resultText(request: StubRequest, index: number): string {
  const lastUser = request.messages.map((message) => message.role).lastIndexOf('user');
  return request.messages.slice(lastUser + 1).filter((message) => message.role === 'tool')[index]?.text ?? '';
}

/**
 * Runs `calls` one per request, then ends the turn with `finalText`. Call ids
 * carry the turn number, so two turns of one session never reuse an id.
 */
export function runTurn(request: StubRequest, calls: ScriptedCall[], finalText: string): StubReply {
  const done = resultsThisTurn(request);
  const call = calls[done];
  if (!call) return { text: finalText };
  return { toolCalls: [{ id: `tc-${userMessages(request).length}-${done}`, name: call.name, arguments: call.arguments }] };
}
