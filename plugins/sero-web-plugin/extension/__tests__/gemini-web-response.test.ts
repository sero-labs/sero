import { describe, expect, it } from 'vitest';
import {
  buildFReqPayload,
  parseStreamGenerateResponse,
  trimJsonEnvelope,
} from '../gemini-web-response';

describe('gemini web response helpers', () => {
  it('keeps uploaded file references in the f.req payload', () => {
    const payload = buildFReqPayload('Summarize this', [
      { id: 'file-1', name: 'one.txt' },
      { id: 'file-2', name: 'two.txt' },
    ]);

    const [, encodedInner] = JSON.parse(payload) as [null, string];
    const [promptPayload] = JSON.parse(encodedInner) as [unknown[]];

    expect(promptPayload[0]).toBe('Summarize this');
    expect(promptPayload[3]).toEqual([[[ 'file-1', 1 ]], [[ 'file-2', 1 ]]]);
  });

  it('parses stream responses and prefers card fallback text when needed', () => {
    const candidate: unknown[] = [];
    candidate[1] = ['http://googleusercontent.com/card_content/123'];
    candidate[22] = ['Resolved card text'];
    const body: unknown[] = [];
    body[4] = [candidate];
    const rawText = JSON.stringify([[null, null, JSON.stringify(body)]]);

    expect(parseStreamGenerateResponse(rawText)).toEqual({
      text: 'Resolved card text',
      errorCode: undefined,
    });
  });

  it('throws when the Gemini response is missing its JSON envelope', () => {
    expect(() => trimJsonEnvelope('not-json')).toThrow('Gemini response did not contain a JSON payload.');
  });
});
