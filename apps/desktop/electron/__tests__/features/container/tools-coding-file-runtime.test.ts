import { describe, expect, it, vi } from 'vitest';

import { createEdit, createRead } from '@electron/features/container/tools/tools-coding';

function createRuntime() {
  const exec = vi.fn(async (input: { command: string }) => {
    if (/\b(cat|od|base64)\b/.test(input.command)) {
      throw new Error(`unexpected shell file command: ${input.command}`);
    }
    return { stdout: '/workspace/file.txt\n', stderr: '', exitCode: 0 };
  });
  const readFile = vi.fn(async (input: { binary?: boolean }) => ({
    content: input.binary ? Buffer.from('hello old\n', 'utf8').toString('base64') : 'hello old\n',
    encoding: input.binary ? 'base64' : 'utf8',
  }));
  const writeFile = vi.fn().mockResolvedValue(undefined);

  return { exec, readFile, writeFile };
}

describe('runtime coding file access', () => {
  it('reads text through RuntimeBackend.readFile without shelling out to cat', async () => {
    const runtime = createRuntime();
    const tool = createRead(runtime as never);

    const result = await tool.execute('tool-read', { path: 'file.txt' }, undefined, undefined, undefined as never);

    expect(runtime.readFile).toHaveBeenCalledWith({ path: '/workspace/file.txt', binary: true });
    expect(runtime.readFile).toHaveBeenCalledWith({ path: '/workspace/file.txt' });
    expect(runtime.exec).toHaveBeenCalledTimes(1);
    expect(result.content).toEqual([{ type: 'text', text: 'hello old\n' }]);
  });

  it('edits through RuntimeBackend.readFile/writeFile without shelling out to cat', async () => {
    const runtime = createRuntime();
    const tool = createEdit(runtime as never);

    await tool.execute(
      'tool-edit',
      { path: 'file.txt', oldText: 'old', newText: 'new' },
      undefined,
      undefined,
      undefined as never,
    );

    expect(runtime.readFile).toHaveBeenCalledWith({ path: '/workspace/file.txt' });
    expect(runtime.writeFile).toHaveBeenCalledWith({ path: '/workspace/file.txt', content: 'hello new\n' });
    expect(runtime.exec).toHaveBeenCalledTimes(1);
  });
});
