import type { IncomingMessage } from 'http';

export interface SseMessage {
  id: string | null;
  event: string;
  data: unknown;
}

export interface SseConnection {
  close: () => void;
  done: Promise<void>;
}

export async function consumeSse(
  response: IncomingMessage,
  onMessage: (message: SseMessage) => void,
): Promise<void> {
  let buffer = '';
  for await (const chunk of response) {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary).replace(/\r/g, '');
      buffer = buffer.slice(boundary + 2);
      const parsed = parseBlock(block);
      if (parsed) onMessage(parsed);
      boundary = buffer.indexOf('\n\n');
    }
  }
}

function parseBlock(block: string): SseMessage | null {
  let id: string | null = null;
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '');
    if (field === 'id') id = value;
    else if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  if (data.length === 0) return null;
  const raw = data.join('\n');
  let value: unknown = raw;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    // Text is valid SSE data and stays text.
  }
  return { id, event, data: value };
}

export function deterministicRetryDelay(attempt: number): number {
  return Math.min(250 * (2 ** Math.max(0, attempt)), 5_000);
}
