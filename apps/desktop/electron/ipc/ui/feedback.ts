/**
 * Feedback IPC handlers — persists response ratings to disk.
 *
 * Saves to ~/.sero-ui/agent/feedback.json using atomic write.
 * This file is also readable by the agent for self-improvement.
 */

import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { IpcChannels } from '../../../src/types/ipc';
import type { ResponseFeedbackEntry, ResponseFeedbackState } from '../../../src/types/ipc';
import { SERO_AGENT_DIR } from '../../env';

const FEEDBACK_FILE = path.join(SERO_AGENT_DIR, 'feedback.json');

let writeQueue: Promise<void> = Promise.resolve();

function parseFeedbackState(raw: string): ResponseFeedbackState {
  try {
    const parsed = JSON.parse(raw.trim());
    if (parsed && Array.isArray(parsed.entries)) return parsed;
  } catch {
    // ignore
  }
  return { entries: [] };
}

async function readFeedback(): Promise<ResponseFeedbackState> {
  if (!existsSync(FEEDBACK_FILE)) return { entries: [] };
  try {
    const raw = await fs.readFile(FEEDBACK_FILE, 'utf8');
    return parseFeedbackState(raw);
  } catch {
    return { entries: [] };
  }
}

async function saveFeedback(state: ResponseFeedbackState): Promise<void> {
  await fs.mkdir(path.dirname(FEEDBACK_FILE), { recursive: true });
  const tmpFile = `${FEEDBACK_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpFile, FEEDBACK_FILE);
}

export function registerFeedbackHandlers(): void {
  // Load all feedback
  ipcMain.handle(IpcChannels.feedback.load, async (): Promise<ResponseFeedbackState> => {
    return readFeedback();
  });

  // Submit or update a feedback entry (upsert by messageId)
  ipcMain.handle(
    IpcChannels.feedback.submit,
    async (_e, entry: ResponseFeedbackEntry): Promise<void> => {
      writeQueue = writeQueue
        .then(async () => {
          const state = await readFeedback();
          const idx = state.entries.findIndex((e) => e.messageId === entry.messageId);
          if (idx >= 0) {
            state.entries[idx] = entry;
          } else {
            state.entries.push(entry);
          }
          await saveFeedback(state);
        })
        .catch(async () => {
          // Retry once on failure
          const state = await readFeedback();
          const idx = state.entries.findIndex((e) => e.messageId === entry.messageId);
          if (idx >= 0) {
            state.entries[idx] = entry;
          } else {
            state.entries.push(entry);
          }
          await saveFeedback(state);
        });
      await writeQueue;
    },
  );

  // Remove feedback by messageId
  ipcMain.handle(IpcChannels.feedback.remove, async (_e, messageId: string): Promise<void> => {
    writeQueue = writeQueue
      .then(async () => {
        const state = await readFeedback();
        state.entries = state.entries.filter((e) => e.messageId !== messageId);
        await saveFeedback(state);
      })
      .catch(() => {
        /* swallow */
      });
    await writeQueue;
  });
}
