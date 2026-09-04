import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionStore } from '@/stores/connection';
import { useWorkspaceStore } from '@/stores/workspace';
import { useFileStore } from '@/stores/files';
import { useChatStore } from '@/stores/chat';
import {
  MAX_UPLOAD_BYTES,
  readableUploadError,
  useUploadsStore,
} from '@/stores/uploads';

const uploadFile = vi.fn((_workspaceId: string, _path: string, _content: string) => {});
// A finished upload refreshes the folder it landed in, which lists files.
const listFiles = vi.fn((_workspaceId: string, _path: string) => {});

/** A File whose size is `bytes`, without allocating that much. */
function fakeFile(name: string, bytes: number): File {
  const file = new File(['x'], name);
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

function okResponse(data: unknown) {
  return { type: 'ok', requestType: 'upload_file', data };
}

describe('readableUploadError', () => {
  it('drops the reason prefix a refusal carries', () => {
    expect(readableUploadError('upload_too_large: That file is too big.')).toBe(
      'That file is too big.',
    );
  });

  it('leaves a plain message alone', () => {
    expect(readableUploadError('Something broke.')).toBe('Something broke.');
  });
});

describe('uploads store', () => {
  beforeEach(() => {
    uploadFile.mockClear();
    listFiles.mockClear();
    useConnectionStore.setState({ client: { uploadFile, listFiles } as unknown as never });
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-1' });
    useUploadsStore.setState({ uploading: false, queued: [], recent: [], error: null });
  });

  it('sends a file to the gateway', async () => {
    await useUploadsStore.getState().upload([new File(['hello'], 'notes.txt')]);

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadFile.mock.calls[0]?.[0]).toBe('ws-1');
    expect(uploadFile.mock.calls[0]?.[1]).toBe('notes.txt');
  });

  it('encodes the content as base64', async () => {
    await useUploadsStore.getState().upload([new File(['hello'], 'notes.txt')]);

    // atob, not Buffer: this file runs in the browser environment.
    const sent = uploadFile.mock.calls[0]?.[2] ?? '';
    expect(atob(sent)).toBe('hello');
  });

  it('sends several files one at a time', async () => {
    await useUploadsStore.getState().upload([
      new File(['a'], 'a.txt'),
      new File(['b'], 'b.txt'),
    ]);

    expect(uploadFile.mock.calls.map((call) => call[1])).toEqual(['a.txt', 'b.txt']);
  });

  it('refuses an oversize file before sending anything', async () => {
    await useUploadsStore.getState().upload([fakeFile('big.bin', MAX_UPLOAD_BYTES + 1)]);

    expect(uploadFile).not.toHaveBeenCalled();
    expect(useUploadsStore.getState().error).toContain('larger than');
  });

  it('refuses the whole batch when one file is oversize', async () => {
    await useUploadsStore.getState().upload([
      new File(['a'], 'a.txt'),
      fakeFile('big.bin', MAX_UPLOAD_BYTES + 1),
    ]);

    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('sends nothing without a workspace', async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: null });

    await useUploadsStore.getState().upload([new File(['a'], 'a.txt')]);

    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('records where the file landed', () => {
    useUploadsStore.getState().handleMessage(
      okResponse({ path: 'uploads/notes.txt', bytes: 5, renamed: false }),
    );

    expect(useUploadsStore.getState().recent[0]?.path).toBe('uploads/notes.txt');
    expect(useUploadsStore.getState().uploading).toBe(false);
  });

  it('says when the host had to rename the file', () => {
    useUploadsStore.getState().handleMessage(
      okResponse({ path: 'uploads/notes-1.txt', bytes: 5, renamed: true }),
    );

    expect(useUploadsStore.getState().recent[0]?.renamed).toBe(true);
  });

  it('refreshes the folder the file landed in', () => {
    const fetchDirectory = vi.fn();
    useFileStore.setState({ fetchDirectory });

    useUploadsStore.getState().handleMessage(
      okResponse({ path: 'uploads/notes.txt', bytes: 5, renamed: false }),
    );

    expect(fetchDirectory).toHaveBeenCalledWith('uploads');
  });

  it('refreshes the root for a file with no folder', () => {
    const fetchDirectory = vi.fn();
    useFileStore.setState({ fetchDirectory });

    useUploadsStore.getState().handleMessage(
      okResponse({ path: 'notes.txt', bytes: 5, renamed: false }),
    );

    expect(fetchDirectory).toHaveBeenCalledWith('/');
  });

  it('shows why an upload was refused, without the reason prefix', () => {
    useUploadsStore.setState({ uploading: true });

    useUploadsStore.getState().handleMessage({
      type: 'error',
      requestType: 'upload_file',
      message: 'upload_invalid_path: Path traversal is not allowed.',
    });

    expect(useUploadsStore.getState().error).toBe('Path traversal is not allowed.');
    expect(useUploadsStore.getState().uploading).toBe(false);
  });

  it('ignores a response to another request', () => {
    useUploadsStore.getState().handleMessage({
      type: 'ok',
      requestType: 'list_files',
      data: { path: 'x' },
    });

    expect(useUploadsStore.getState().recent).toEqual([]);
  });

  it('puts an uploaded path into the composer and opens the chat', () => {
    useWorkspaceStore.setState({ view: 'board' });

    useUploadsStore.getState().mention('uploads/notes.txt');

    expect(useChatStore.getState().composerPrefill).toBe('uploads/notes.txt');
    expect(useWorkspaceStore.getState().view).toBe('chat');
  });
});
