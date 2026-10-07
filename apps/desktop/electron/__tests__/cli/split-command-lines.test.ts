import { describe, expect, it } from 'vitest';

import { splitCommandLines, tokenizeCliInput } from '@electron/cli/core/parser';

describe('splitCommandLines', () => {
  it('runs one command per line', () => {
    expect(splitCommandLines('todo list\n\n  todo add "milk"\r\n')).toEqual(['todo list', 'todo add "milk"']);
  });

  it('keeps a quoted argument that spans lines as one command', () => {
    const script = 'window.a = 1,\n  window.b = "two";';
    const lines = splitCommandLines(`automation_browser evaluate --expression '${script}'\ntodo list`);

    expect(lines).toHaveLength(2);
    expect(tokenizeCliInput(lines[0] ?? '').at(-1)).toBe(script);
    expect(lines[1]).toBe('todo list');
  });
});
