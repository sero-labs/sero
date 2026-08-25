import type { PinnedTransport } from './pinned-transport';
import { isRecord } from './types';

export class JsonHttpError extends Error {
  constructor(readonly code: string | null, message: string) {
    super(message);
    this.name = 'JsonHttpError';
  }
}

export function parseJson(body: Buffer): unknown {
  if (body.length === 0) return null;
  return JSON.parse(body.toString('utf8')) as unknown;
}

export async function postJson(
  transport: PinnedTransport,
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ value: unknown; headers: Record<string, string | string[] | undefined> }> {
  const response = await transport.request('POST', path, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const value = parseJson(response.body);
  if (response.status < 200 || response.status >= 300) {
    const nested = isRecord(value) && isRecord(value.error) ? value.error : null;
    const errorCode = nested && typeof nested.code === 'string' ? nested.code : null;
    const message = nested && typeof nested.message === 'string'
      ? nested.message
      : `Agent node returned HTTP ${response.status}`;
    throw new JsonHttpError(errorCode, `${errorCode ? `${errorCode}: ` : ''}${message}`);
  }
  return { value, headers: response.headers };
}
