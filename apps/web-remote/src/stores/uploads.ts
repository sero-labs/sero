/**
 * Uploads store — putting a file into the workspace from a phone.
 *
 * Files are sent one at a time. The gateway decides the final name and
 * sends it back, because a name already taken gets a suffix rather than
 * overwriting anything.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import { useWorkspaceStore } from './workspace';
import { useFileStore } from './files';
import { useChatStore } from './chat';
import { takeSharedFile } from '@/lib/share-target';

/**
 * Largest file accepted, checked here before anything is sent.
 * The host enforces the same limit; this only saves the round trip.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Where an upload lands when only a name is sent. */
export const UPLOAD_DIR = 'uploads';

export interface UploadResult {
  path: string;
  bytes: number;
  /** True when the name was taken and a suffix was added. */
  renamed: boolean;
}

interface UploadsStore {
  uploading: boolean;
  /** Names still waiting, so the panel can say how many are left. */
  queued: string[];
  /** Files put into the workspace this session, newest first. */
  recent: UploadResult[];
  error: string | null;
  upload: (files: File[]) => Promise<void>;
  /** Upload a file the phone's share sheet left for us. */
  uploadShared: () => Promise<void>;
  /** Put an uploaded path into the composer and go to the chat. */
  mention: (filePath: string) => void;
  dismissError: () => void;
  handleMessage: (msg: { type: string; requestType?: string; data?: unknown; message?: string }) => void;
}

/** How long a shared file waits for a workspace before giving up. */
const SHARE_WAIT_MS = 15_000;

/**
 * Wait until a workspace is open, so a share has somewhere to land.
 *
 * A share opens the app cold: the gateway is still connecting when the
 * file arrives. Returns false when nothing opened in time.
 */
export function waitForWorkspace(timeoutMs = SHARE_WAIT_MS): Promise<boolean> {
  if (useWorkspaceStore.getState().activeWorkspaceId) return Promise.resolve(true);

  return new Promise((resolve) => {
    const stop = useWorkspaceStore.subscribe((state) => {
      if (!state.activeWorkspaceId) return;
      stop();
      clearTimeout(timer);
      resolve(true);
    });

    const timer = setTimeout(() => {
      stop();
      resolve(false);
    }, timeoutMs);
  });
}

/** A file's bytes as base64, without the `data:` prefix. */
export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma === -1 ? '' : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/** The message a refusal carries, without the reason prefix. */
export function readableUploadError(message: string): string {
  const separator = message.indexOf(': ');
  return separator === -1 ? message : message.slice(separator + 2);
}

export const useUploadsStore = create<UploadsStore>((set, get) => ({
  uploading: false,
  queued: [],
  recent: [],
  error: null,

  upload: async (files: File[]) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
    const client = useConnectionStore.getState().client;
    if (!workspaceId || !client || files.length === 0) return;

    const tooBig = files.find((file) => file.size > MAX_UPLOAD_BYTES);
    if (tooBig) {
      set({
        error: `${tooBig.name} is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit.`,
      });
      return;
    }

    set({ uploading: true, error: null, queued: files.map((file) => file.name) });

    // One file at a time on purpose: reading every file at once would
    // hold all of them in memory as base64 on a phone.
    for (const file of files) {
      try {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const contentBase64 = await readAsBase64(file);
        client.uploadFile(workspaceId, file.name, contentBase64);
      } catch (err) {
        set({ error: err instanceof Error ? err.message : `Could not read ${file.name}.` });
      }
      set((s) => ({ queued: s.queued.slice(1) }));
    }
  },

  uploadShared: async () => {
    const file = await takeSharedFile();
    if (!file) return;

    // A share can land before a workspace is chosen, or before the
    // gateway answers. The file waits in memory until both are there.
    const ready = await waitForWorkspace();
    if (!ready) {
      set({ error: `Could not put ${file.name} anywhere: no workspace was open.` });
      return;
    }

    await get().upload([file]);
  },

  mention: (filePath: string) => {
    useChatStore.getState().setComposerPrefill(filePath);
    // The composer is where this text is going, so go there too.
    useWorkspaceStore.getState().setView('chat');
  },

  dismissError: () => set({ error: null }),

  handleMessage: (msg) => {
    if (msg.requestType !== 'upload_file') return;

    if (msg.type === 'error') {
      set({ uploading: false, queued: [], error: readableUploadError(msg.message ?? 'The upload failed.') });
      return;
    }
    if (msg.type !== 'ok') return;

    const result = msg.data as UploadResult | undefined;
    if (!result || typeof result.path !== 'string') return;

    set((s) => ({
      uploading: s.queued.length > 0,
      recent: [result, ...s.recent].slice(0, 10),
    }));

    // The tree only shows what it has listed, so refresh the folders the
    // new file sits in.
    useFileStore.getState().refreshAfterUpload(result.path);
  },
}));
