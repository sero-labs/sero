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
import { EventEmitter } from 'events';
import { IpcChannels } from '../../src/types/ipc';
import type {
  UserFeedbackPendingQuestion,
  UserFeedbackResponse,
} from '../../src/types/ipc';

// ── Shared EventEmitter (globalThis singleton) ─────────────────

const EMITTER_KEY = '__seroUserFeedbackBus';

function getEmitter(): EventEmitter {
  const g = globalThis as Record<string, unknown>;
  if (!g[EMITTER_KEY]) {
    g[EMITTER_KEY] = new EventEmitter();
    (g[EMITTER_KEY] as EventEmitter).setMaxListeners(50);
  }
  return g[EMITTER_KEY] as EventEmitter;
}

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

export function registerUserFeedbackQuestionHandlers(): void {
  const bus = getEmitter();

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
