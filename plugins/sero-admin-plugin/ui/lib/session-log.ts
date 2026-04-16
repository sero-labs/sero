import { formatTime } from './format';

export interface SessionMessageEntry {
  index: number;
  role: string;
  preview: string;
  timestamp: string;
  raw: Record<string, unknown>;
}

export interface ParsedSessionLog {
  entries: SessionMessageEntry[];
  malformedLines: number[];
}

export function parseSessionJsonl(raw: string): ParsedSessionLog {
  const entries: SessionMessageEntry[] = [];
  const malformedLines: number[] = [];
  const lines = raw.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line.trim()) {
      continue;
    }

    try {
      const data = JSON.parse(line) as Record<string, unknown>;
      const msg = data.message as Record<string, unknown> | undefined;
      const role = (msg?.role as string) || (data.type as string) || 'unknown';
      const timestamp = (data.timestamp as string) || (msg?.timestamp as string) || '';

      entries.push({
        index: entries.length,
        role,
        preview: extractPreview(data),
        timestamp: timestamp ? formatTime(timestamp) : '',
        raw: data,
      });
    } catch {
      malformedLines.push(lineIndex + 1);
    }
  }

  return { entries, malformedLines };
}

export function formatMalformedLineSummary(lineNumbers: number[]): string | null {
  if (lineNumbers.length === 0) {
    return null;
  }

  const preview = lineNumbers.slice(0, 5).join(', ');
  const suffix = lineNumbers.length > 5 ? ', …' : '';
  const lineLabel = lineNumbers.length === 1 ? 'line' : 'lines';
  return `Skipped ${lineNumbers.length} malformed ${lineLabel}: ${preview}${suffix}`;
}

function extractPreview(data: Record<string, unknown>): string {
  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) {
    return JSON.stringify(data).slice(0, 300);
  }

  const content = msg.content;
  if (typeof content === 'string') {
    return content.slice(0, 500);
  }

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== 'object') {
        continue;
      }

      if ('text' in block && typeof block.text === 'string') {
        parts.push(block.text.slice(0, 500));
      }

      if ('name' in block && typeof block.name === 'string') {
        const args = 'arguments' in block && block.arguments
          ? (typeof block.arguments === 'string'
            ? block.arguments
            : JSON.stringify(block.arguments))
          : '';
        parts.push(`Tool: ${block.name}${args ? ` — ${args.slice(0, 200)}` : ''}`);
      }
    }

    if (parts.length > 0) {
      return parts.join(' ');
    }
  }

  if (typeof msg.toolName === 'string') {
    const resultContent = msg.content;
    if (Array.isArray(resultContent)) {
      for (const block of resultContent) {
        if (block && typeof block === 'object' && 'text' in block) {
          return `${msg.toolName}: ${String(block.text).slice(0, 300)}`;
        }
      }
    }
    return `Tool result: ${msg.toolName}`;
  }

  return `[${String(msg.role || 'message')}]`;
}
