/**
 * User Feedback IPC handlers.
 *
 * Bridges between the Pi extension (which emits on a globalThis EventEmitter)
 * and the Electron renderer (which shows interactive question UIs).
 *
 * Tracks pending questions so late-mounting components (e.g. the federated
 * UserFeedbackApp) can hydrate via getPending.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IpcChannels } from '../../../../src/types/ipc';
import type {
  UserFeedbackPendingQuestion,
  UserFeedbackResponse,
} from '../../../../src/types/ipc';
import { getUserFeedbackBus } from '../../../shared/lib/user-feedback-bus';

function sendToAllWindows(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data);
  }
}

// ── Pending question tracking ──────────────────────────────────
//
// Maintained so that components mounting after the event fired
// (e.g. the UserFeedbackApp when user switches tabs) can hydrate.

const pendingQuestions = new Map<string, UserFeedbackPendingQuestion>();

/** Max age (ms) before an unanswered question is automatically evicted. */
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Evict questions older than PENDING_TTL_MS to prevent memory leaks. */
function evictStale(): void {
  const now = Date.now();
  for (const [id, q] of pendingQuestions) {
    if (now - new Date(q.timestamp).getTime() > PENDING_TTL_MS) {
      pendingQuestions.delete(id);
    }
  }
}

export function registerUserFeedbackQuestionHandlers(): void {
  const bus = getUserFeedbackBus();

  // Periodic cleanup of orphaned questions
  setInterval(evictStale, 60_000);

  // ── Extension → Renderer: forward question requests ──────────

  bus.on('question-request', (data: UserFeedbackPendingQuestion) => {
    pendingQuestions.set(data.id, data);
    sendToAllWindows(IpcChannels.userFeedback.question, data);
  });

  // ── Extension signals cancellation (e.g. tool aborted) ───────

  bus.on('question-cancel', (data: { id: string }) => {
    pendingQuestions.delete(data.id);
    sendToAllWindows(IpcChannels.userFeedback.cancel, data);
  });

  // ── Renderer → Main: user answered ───────────────────────────

  ipcMain.handle(
    IpcChannels.userFeedback.answer,
    async (_event, response: UserFeedbackResponse): Promise<void> => {
      pendingQuestions.delete(response.id);
      bus.emit(`answer:${response.id}`, response);
      sendToAllWindows(IpcChannels.userFeedback.cancel, { id: response.id });
    },
  );

  // ── Renderer → Main: get all pending questions ───────────────
  //
  // Used by components that mount after the question event fired.

  ipcMain.handle(
    IpcChannels.userFeedback.getPending,
    async (): Promise<UserFeedbackPendingQuestion[]> => {
      return Array.from(pendingQuestions.values());
    },
  );
}
