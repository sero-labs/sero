import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_UPLOAD_DIR,
  MAX_UPLOAD_BYTES,
  normalizeUploadPath,
  suffixName,
  uploadFile,
} from '@electron/ipc/gateway/upload-file';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';

interface FakeRuntime {
  runtime: RuntimeBackend;
  written: Array<{ path: string; content: string; encoding?: string }>;
}

/** A runtime holding `existing` paths, recording every write. */
function fakeRuntime(existing: string[] = [], backend = 'host'): FakeRuntime {
  const written: FakeRuntime['written'] = [];
  const present = new Set(existing);

  const runtime = {
    backend,
    readFile: async ({ path }: { path: string }) => {
      if (!present.has(path)) throw new Error('ENOENT');
      return { content: '', encoding: 'utf8' as const };
    },
    writeFile: async (input: { path: string; content: string; encoding?: string }) => {
      written.push(input);
      present.add(input.path);
    },
  } as unknown as RuntimeBackend;

  return { runtime, written };
}

describe('normalizeUploadPath', () => {
  it('puts a bare name in the uploads folder', () => {
    expect(normalizeUploadPath('report.pdf')).toBe(`${DEFAULT_UPLOAD_DIR}/report.pdf`);
  });

  it('keeps a path the caller wrote out in full', () => {
    expect(normalizeUploadPath('docs/report.pdf')).toBe('docs/report.pdf');
  });

  it('drops a leading ./', () => {
    expect(normalizeUploadPath('./report.pdf')).toBe(`${DEFAULT_UPLOAD_DIR}/report.pdf`);
  });

  it('refuses a traversal attempt', () => {
    expect(() => normalizeUploadPath('../../etc/passwd')).toThrow(/traversal/i);
    expect(() => normalizeUploadPath('docs/../../etc/passwd')).toThrow(/traversal/i);
  });

  it('refuses an absolute path', () => {
    expect(() => normalizeUploadPath('/etc/passwd')).toThrow(/inside the workspace/i);
    expect(() => normalizeUploadPath('C:\\Windows\\notes.txt')).toThrow(/inside the workspace/i);
  });

  it('refuses a null byte', () => {
    expect(() => normalizeUploadPath('a\0b.txt')).toThrow(/null bytes/i);
  });

  it('refuses an empty name', () => {
    expect(() => normalizeUploadPath('   ')).toThrow(/file name/i);
    // A path of separators alone is caught earlier, as an absolute path.
    expect(() => normalizeUploadPath('///')).toThrow(/inside the workspace/i);
    expect(() => normalizeUploadPath('.')).toThrow(/file name/i);
  });
});

describe('suffixName', () => {
  it('puts the number before the extension', () => {
    expect(suffixName('uploads/report.pdf', 1)).toBe('uploads/report-1.pdf');
  });

  it('handles a name with no extension', () => {
    expect(suffixName('uploads/LICENSE', 2)).toBe('uploads/LICENSE-2');
  });
});

describe('uploadFile', () => {
  const content = Buffer.from('hello').toString('base64');

  it('writes the file and reports where it landed', async () => {
    const { runtime, written } = fakeRuntime();

    const result = await uploadFile(runtime, 'notes.txt', content);

    expect(result).toEqual({ path: 'uploads/notes.txt', bytes: 5, renamed: false });
    expect(written[0]?.path).toBe('uploads/notes.txt');
  });

  it('writes binary content as base64, so a PDF survives', async () => {
    const { runtime, written } = fakeRuntime();
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]).toString('base64');

    await uploadFile(runtime, 'a.pdf', pdf);

    expect(written[0]?.encoding).toBe('base64');
    expect(Buffer.from(written[0]?.content ?? '', 'base64')).toEqual(
      Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]),
    );
  });

  it('never overwrites: a taken name gets a suffix', async () => {
    const { runtime } = fakeRuntime(['uploads/notes.txt']);

    const result = await uploadFile(runtime, 'notes.txt', content);

    expect(result.path).toBe('uploads/notes-1.txt');
    expect(result.renamed).toBe(true);
  });

  it('keeps counting when several suffixes are taken', async () => {
    const { runtime } = fakeRuntime([
      'uploads/notes.txt',
      'uploads/notes-1.txt',
      'uploads/notes-2.txt',
    ]);

    expect((await uploadFile(runtime, 'notes.txt', content)).path).toBe('uploads/notes-3.txt');
  });

  it('refuses a file over the size cap', async () => {
    const { runtime } = fakeRuntime();
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1).toString('base64');

    await expect(uploadFile(runtime, 'big.bin', big)).rejects.toMatchObject({
      reason: 'upload_too_large',
    });
  });

  it('refuses content that is not base64', async () => {
    const { runtime } = fakeRuntime();

    await expect(uploadFile(runtime, 'a.txt', '!!!!')).rejects.toMatchObject({
      reason: 'upload_invalid_content',
    });
  });

  it('refuses a traversal attempt before touching the runtime', async () => {
    const { runtime, written } = fakeRuntime();

    await expect(uploadFile(runtime, '../escape.txt', content)).rejects.toMatchObject({
      reason: 'upload_invalid_path',
    });
    expect(written).toEqual([]);
  });

  it('refuses a runtime that cannot take binary content', async () => {
    const { runtime, written } = fakeRuntime([], 'apple-container');

    await expect(uploadFile(runtime, 'a.pdf', content)).rejects.toMatchObject({
      reason: 'upload_unsupported_runtime',
    });
    expect(written).toEqual([]);
  });

  it('accepts an empty file', async () => {
    const { runtime } = fakeRuntime();

    expect((await uploadFile(runtime, 'empty.txt', '')).bytes).toBe(0);
  });
});

describe('the upload handler', () => {
  it('is reachable by a workspace-scoped token', async () => {
    const { routeWorkspaceRequest } = await import(
      '@electron/features/gateway/server/workspace-handlers'
    );
    const { WebSocket } = await import('ws');

    const sent: Array<{ type: string; data?: unknown }> = [];
    const ws = {
      readyState: WebSocket.OPEN,
      send: (payload: string) => sent.push(JSON.parse(payload)),
    } as unknown as InstanceType<typeof WebSocket>;

    const uploadFileOp = vi.fn(async () => ({
      path: 'uploads/a.txt',
      bytes: 5,
      renamed: false,
    }));

    await routeWorkspaceRequest(
      ws,
      { uploadFile: uploadFileOp } as never,
      {
        type: 'upload_file',
        workspaceId: 'ws-1',
        path: 'a.txt',
        contentBase64: Buffer.from('hello').toString('base64'),
      } as never,
      {
        authorizedWorkspaceIds: new Set(['ws-1']),
        authorizedSessions: new Map(),
        authorizedArtifacts: new Map(),
      },
    );

    expect(uploadFileOp).toHaveBeenCalled();
    expect(sent[0]?.type).toBe('ok');
  });

  it('refuses a workspace the token cannot reach', async () => {
    const { routeWorkspaceRequest } = await import(
      '@electron/features/gateway/server/workspace-handlers'
    );
    const { WebSocket } = await import('ws');

    const sent: Array<{ type: string; message?: string }> = [];
    const ws = {
      readyState: WebSocket.OPEN,
      send: (payload: string) => sent.push(JSON.parse(payload)),
    } as unknown as InstanceType<typeof WebSocket>;

    const uploadFileOp = vi.fn();

    await routeWorkspaceRequest(
      ws,
      { uploadFile: uploadFileOp } as never,
      {
        type: 'upload_file',
        workspaceId: 'ws-2',
        path: 'a.txt',
        contentBase64: 'aGk=',
      } as never,
      {
        authorizedWorkspaceIds: new Set(['ws-1']),
        authorizedSessions: new Map(),
        authorizedArtifacts: new Map(),
      },
    );

    expect(sent[0]?.type).toBe('error');
    expect(uploadFileOp).not.toHaveBeenCalled();
  });
});
