import { describe, expect, it, vi } from 'vitest';
import { Value } from 'typebox/value';

import { EditParams } from '@electron/features/container/tools/tool-schemas';
import {
  boundDiffText,
  createEditTool,
  createWriteTool,
  EDIT_DIFF_MAX_BYTES,
  EDIT_DIFF_MAX_LINES,
  type FileMutationPort,
  type MutationTarget,
} from '@electron/features/container/tools/edit-core';

/**
 * Drive the tool through its runtime contract. The edit parameter shape is
 * asserted directly with the schema below, so the tool calls pass plain input
 * objects and let the schema decide what is valid.
 */
type LooseExecute = (
  toolCallId: string,
  params: unknown,
  signal?: AbortSignal,
) => Promise<{ content: Array<{ type: string; text?: string }>; details?: unknown }>;

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

class MemoryPort implements FileMutationPort {
  readonly files = new Map<string, string>();
  readonly writes: Array<{ path: string; content: string }> = [];
  readGate: (() => Promise<void>) | undefined;
  writeGate: (() => Promise<void>) | undefined;
  readError: Error | undefined;

  async resolveTarget(absolutePath: string): Promise<MutationTarget> {
    return { key: `memory:${absolutePath}`, canonicalPath: absolutePath };
  }

  async readFile(absolutePath: string): Promise<string> {
    if (this.readGate) await this.readGate();
    if (this.readError) throw this.readError;
    const content = this.files.get(absolutePath);
    if (content === undefined) throw new Error(`ENOENT: ${absolutePath}`);
    return content;
  }

  async writeFile(absolutePath: string, content: string): Promise<void> {
    if (this.writeGate) await this.writeGate();
    this.files.set(absolutePath, content);
    this.writes.push({ path: absolutePath, content });
  }
}

function buildTool(port: MemoryPort, onAssert?: (target: MutationTarget) => void) {
  return createEditTool({
    port,
    resolvePath: (requestedPath) => requestedPath,
    assertAllowed: (target) => onAssert?.(target),
  });
}

function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .map((part) => (part.type === 'text' ? part.text ?? '' : ''))
    .join('\n');
}

function resultDiff(result: { details?: unknown }): string {
  const details = result.details as { diff?: string } | undefined;
  return details?.diff ?? '';
}

async function runEdit(
  tool: ReturnType<typeof createEditTool>,
  input: unknown,
  signal?: AbortSignal,
) {
  const execute = tool.execute as unknown as LooseExecute;
  return execute('tool-call', input, signal);
}

describe('edit parameter schema', () => {
  it('accepts the single form, the array form, and both forms together', () => {
    expect(Value.Check(EditParams, { path: 'a.ts', oldText: 'a', newText: 'b' })).toBe(true);
    expect(Value.Check(EditParams, {
      path: 'a.ts',
      edits: [{ oldText: 'a', newText: 'b' }],
    })).toBe(true);
    expect(Value.Check(EditParams, {
      path: 'a.ts',
      edits: [{ oldText: 'a', newText: 'b' }],
      oldText: 'c',
      newText: 'd',
    })).toBe(true);
    expect(Value.Check(EditParams, { path: 'a.ts' })).toBe(true);
  });
});

describe('multi-replacement edits', () => {
  it('applies three separate regions and writes once', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'const a = 1;\nconst b = 2;\nconst c = 3;\n');
    const result = await runEdit(buildTool(port), {
      path: '/a.ts',
      edits: [
        { oldText: 'const a = 1;', newText: 'const a = 10;' },
        { oldText: 'const b = 2;', newText: 'const b = 20;' },
        { oldText: 'const c = 3;', newText: 'const c = 30;' },
      ],
    });

    expect(port.files.get('/a.ts')).toBe('const a = 10;\nconst b = 20;\nconst c = 30;\n');
    expect(port.writes).toHaveLength(1);
    expect(resultText(result)).toContain('Replaced 3 blocks in /a.ts.');
  });

  it('rejects overlapping and nested regions without writing', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'abcdef\n');
    await expect(runEdit(buildTool(port), {
      path: '/a.ts',
      edits: [
        { oldText: 'abcd', newText: 'x' },
        { oldText: 'cdef', newText: 'y' },
      ],
    })).rejects.toThrow(/overlap/i);
    expect(port.files.get('/a.ts')).toBe('abcdef\n');
    expect(port.writes).toHaveLength(0);
  });

  it('fails the whole call and names the failing replacement on a miss', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'alpha\nbeta\n');
    await expect(runEdit(buildTool(port), {
      path: '/a.ts',
      edits: [
        { oldText: 'alpha', newText: 'ALPHA' },
        { oldText: 'gamma', newText: 'GAMMA' },
      ],
    })).rejects.toThrow(/edits\[1\]/);
    expect(port.files.get('/a.ts')).toBe('alpha\nbeta\n');
    expect(port.writes).toHaveLength(0);
  });

  it('fails on an ambiguous replacement and names it', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'same\nother\nsame\n');
    await expect(runEdit(buildTool(port), {
      path: '/a.ts',
      edits: [
        { oldText: 'same', newText: 'x' },
        { oldText: 'other', newText: 'y' },
      ],
    })).rejects.toThrow(/Found 2 matches for edits\[0\]/);
    expect(port.writes).toHaveLength(0);
  });

  it('applies every array entry when both input forms are present', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'one\ntwo\n');
    await runEdit(buildTool(port), {
      path: '/a.ts',
      edits: [
        { oldText: 'one', newText: '1' },
        { oldText: 'two', newText: '2' },
      ],
      oldText: 'one',
      newText: 'should-not-apply',
    });
    expect(port.files.get('/a.ts')).toBe('1\n2\n');
  });

  it('rejects a batch that contains a no-op replacement and names its index', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'alpha\nbeta\n');
    await expect(runEdit(buildTool(port), {
      path: '/a.ts',
      edits: [
        { oldText: 'alpha', newText: 'ALPHA' },
        { oldText: 'beta', newText: 'beta' },
      ],
    })).rejects.toThrow(/edits\[1\] in \/a\.ts would replace text with identical text/);
    expect(port.files.get('/a.ts')).toBe('alpha\nbeta\n');
    expect(port.writes).toHaveLength(0);
  });

  it('rejects a one-entry no-op batch without writing', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'alpha\n');
    await expect(runEdit(buildTool(port), {
      path: '/a.ts',
      edits: [{ oldText: 'alpha', newText: 'alpha' }],
    })).rejects.toThrow(/would replace text with identical text/);
    expect(port.writes).toHaveLength(0);
  });
});

describe('mixed exact and fuzzy matching', () => {
  it('keeps unchanged lines and applies both replacements when fuzzy normalization changes offsets', async () => {
    const port = new MemoryPort();
    port.files.set(
      '/a.ts',
      'const a = 1;   \nconst b = “smart”;\nconst c = 3;\t\n',
    );
    await runEdit(buildTool(port), {
      path: '/a.ts',
      edits: [
        { oldText: 'const a = 1;', newText: 'const a = 10;' },
        { oldText: 'const b = "smart";', newText: 'const b = "plain";' },
      ],
    });

    expect(port.files.get('/a.ts')).toBe(
      'const a = 10;\nconst b = "plain";\nconst c = 3;\t\n',
    );
  });

  it('preserves a BOM and CRLF endings across a mixed batch', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', '\uFEFFone\r\ntwo   \r\nthree\r\n');
    await runEdit(buildTool(port), {
      path: '/a.ts',
      edits: [
        { oldText: 'one', newText: 'ONE' },
        { oldText: 'two', newText: 'TWO' },
      ],
    });

    expect(port.files.get('/a.ts')).toBe('\uFEFFONE\r\nTWO   \r\nthree\r\n');
  });

  it('preserves unchanged lines for a single fuzzy replacement', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'const label = “café”;\nconst keep = 1;\t\n');
    await runEdit(buildTool(port), {
      path: '/a.ts',
      oldText: 'const label = "café";',
      newText: 'const label = "cafe";',
    });

    expect(port.files.get('/a.ts')).toBe('const label = "cafe";\nconst keep = 1;\t\n');
  });
});

describe('result feedback', () => {
  it('shows added and removed lines in the model-visible content', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'before\nold line\nafter\n');
    const result = await runEdit(buildTool(port), {
      path: '/a.ts',
      oldText: 'old line',
      newText: 'new line',
    });

    const text = resultText(result);
    expect(text).toContain('-2 old line');
    expect(text).toContain('+2 new line');
    expect(text).not.toContain('[diff truncated:');
    expect(resultDiff(result)).toBeTruthy();
  });

  it('bounds an oversized diff and marks truncation', () => {
    const diff = Array.from({ length: 500 }, (_, index) => `+${index} line`).join('\n');
    const bounded = boundDiffText(diff, 10, 1024);
    expect(bounded).toContain('[diff truncated: showing 10 of 500 lines]');
    expect(bounded.split('\n')).toHaveLength(11);
  });

  it('caps the model-visible diff for a large change', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', `${'old\n'.repeat(400)}`);
    const result = await runEdit(buildTool(port), {
      path: '/a.ts',
      oldText: 'old\n'.repeat(400),
      newText: `${'new\n'.repeat(400)}`,
    });

    const text = resultText(result);
    expect(text).toContain('[diff truncated:');
    const shown = text.split('\n\n').slice(1).join('\n\n');
    expect(shown.split('\n').length).toBeLessThanOrEqual(EDIT_DIFF_MAX_LINES + 1);
    expect(Buffer.byteLength(shown, 'utf-8')).toBeLessThanOrEqual(EDIT_DIFF_MAX_BYTES);
    expect(resultDiff(result)).toBeTruthy();
  });

  it('reports the real matching rule and a nearest candidate region on a miss', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'const total = computeTotal(items);\nconst other = 1;\n');
    await expect(runEdit(buildTool(port), {
      path: '/a.ts',
      oldText: 'const total = computeSum(items);',
      newText: 'const total = 0;',
    })).rejects.toThrow(/Nearest candidate region/);
  });

  it('runs the protected-path check inside the mutation', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'a\n');
    const assertAllowed = vi.fn((target: MutationTarget) => {
      if (target.canonicalPath === '/blocked') throw new Error('blocked path');
    });
    const tool = buildTool(port, assertAllowed);
    await expect(runEdit(tool, { path: '/blocked', oldText: 'a', newText: 'b' }))
      .rejects.toThrow('blocked path');
    expect(port.writes).toHaveLength(0);
  });
});

describe('serialized mutations and cancellation', () => {
  it('runs a write after an edit and replaces the file with its payload', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'one\ntwo\n');
    const edit = buildTool(port);
    const write = createWriteTool({
      port,
      resolvePath: (requestedPath) => requestedPath,
      assertAllowed: () => undefined,
    });

    await edit.execute('e', { path: '/a.ts', oldText: 'one', newText: '1' }, undefined, undefined, undefined as never);
    await write.execute('w', { path: '/a.ts', content: 'whole file\n' }, undefined, undefined, undefined as never);

    expect(port.files.get('/a.ts')).toBe('whole file\n');
    expect(port.writes).toHaveLength(2);
  });

  it('lets an edit after a whole-file write match the written payload', async () => {
    const port = new MemoryPort();
    const write = createWriteTool({
      port,
      resolvePath: (requestedPath) => requestedPath,
      assertAllowed: () => undefined,
    });
    await write.execute('w', { path: '/a.ts', content: 'first\nsecond\n' }, undefined, undefined, undefined as never);
    await buildTool(port).execute(
      'e',
      { path: '/a.ts', oldText: 'second', newText: 'SECOND' },
      undefined,
      undefined,
      undefined as never,
    );
    expect(port.files.get('/a.ts')).toBe('first\nSECOND\n');
  });

  it('does not write when a queued mutation is cancelled before admission', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'one\n');
    const gate = deferred();
    port.readGate = () => gate.promise;

    const first = buildTool(port).execute(
      'e1',
      { path: '/a.ts', oldText: 'one', newText: '1' },
      undefined,
      undefined,
      undefined as never,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const controller = new AbortController();
    controller.abort();
    const second = createWriteTool({
      port,
      resolvePath: (requestedPath) => requestedPath,
      assertAllowed: () => undefined,
    }).execute(
      'w1',
      { path: '/a.ts', content: 'cancelled payload\n' },
      controller.signal,
      undefined,
      undefined as never,
    );
    await expect(second).rejects.toThrow('Operation aborted');

    gate.resolve();
    await first;
    expect(port.files.get('/a.ts')).toBe('1\n');
    expect(port.writes.some((entry) => entry.content === 'cancelled payload\n')).toBe(false);
  });

  it('does not write when an edit is cancelled during its read', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'one\n');
    const gate = deferred();
    port.readGate = () => gate.promise;

    const controller = new AbortController();
    const pending = buildTool(port).execute(
      'e1',
      { path: '/a.ts', oldText: 'one', newText: '1' },
      controller.signal,
      undefined,
      undefined as never,
    );
    controller.abort();
    gate.resolve();

    await expect(pending).rejects.toThrow('Operation aborted');
    expect(port.writes).toHaveLength(0);
    expect(port.files.get('/a.ts')).toBe('one\n');
  });

  it('holds the lock until an in-flight write settles after cancellation', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'one\n');
    const writeGate = deferred();
    port.writeGate = () => writeGate.promise;

    const order: string[] = [];
    const controller = new AbortController();
    const first = buildTool(port).execute(
      'e1',
      { path: '/a.ts', oldText: 'one', newText: '1' },
      controller.signal,
      undefined,
      undefined as never,
    ).then(
      () => order.push('first:resolved'),
      () => order.push('first:rejected'),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const second = createWriteTool({
      port,
      resolvePath: (requestedPath) => requestedPath,
      assertAllowed: () => undefined,
    }).execute('w1', { path: '/a.ts', content: 'two\n' }, undefined, undefined, undefined as never)
      .then(() => order.push('second:done'));

    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual([]);

    writeGate.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual(['first:rejected', 'second:done']);
    expect(port.files.get('/a.ts')).toBe('two\n');
  });

  it('releases the queue for later calls after a rejected write', async () => {
    const port = new MemoryPort();
    port.files.set('/a.ts', 'one\n');
    port.writeGate = async () => {
      throw new Error('write failed');
    };
    await expect(runEdit(buildTool(port), {
      path: '/a.ts',
      oldText: 'one',
      newText: '1',
    })).rejects.toThrow('write failed');

    port.writeGate = undefined;
    await runEdit(buildTool(port), { path: '/a.ts', oldText: 'one', newText: '1' });
    expect(port.files.get('/a.ts')).toBe('1\n');
  });
});
