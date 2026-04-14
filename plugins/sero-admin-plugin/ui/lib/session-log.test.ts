import { describe, expect, it } from 'vitest';
import { formatMalformedLineSummary, parseSessionJsonl } from './session-log';

describe('session log parsing', () => {
  it('parses valid JSONL entries and tracks malformed line numbers', () => {
    const raw = [
      JSON.stringify({
        timestamp: '2026-04-14T12:00:00.000Z',
        message: { role: 'user', content: 'hello world' },
      }),
      '{bad json',
      '',
      JSON.stringify({
        type: 'toolResult',
        message: {
          toolName: 'read',
          content: [{ text: 'ok' }],
        },
      }),
    ].join('\n');

    const parsed = parseSessionJsonl(raw);

    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]).toMatchObject({
      index: 0,
      role: 'user',
      preview: 'hello world',
    });
    expect(parsed.entries[0].timestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(parsed.entries[1]).toMatchObject({
      index: 1,
      role: 'toolResult',
      preview: 'ok',
    });
    expect(parsed.malformedLines).toEqual([2]);
  });

  it('formats malformed-line warnings for the admin UI', () => {
    expect(formatMalformedLineSummary([])).toBeNull();
    expect(formatMalformedLineSummary([4])).toBe('Skipped 1 malformed line: 4');
    expect(formatMalformedLineSummary([4, 8, 15, 16, 23, 42])).toBe(
      'Skipped 6 malformed lines: 4, 8, 15, 16, 23, …',
    );
  });
});
