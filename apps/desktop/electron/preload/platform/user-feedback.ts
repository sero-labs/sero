/// <reference lib="dom" />
/**
 * Preload bridge for the userFeedback IPC namespace.
 *
 * Extracted from preload.ts to keep it under 500 LOC.
 * Uses /// reference lib="dom" because the preload runs in a renderer
 * context but the electron tsconfig only includes ES2022.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';
import type {
  UserFeedbackPendingQuestion,
  UserFeedbackResponse,
} from '../../../src/types/ipc';

export const userFeedbackBridge = {
  /** Get all currently pending questions (for mount-time hydration). */
  getPending: (): Promise<UserFeedbackPendingQuestion[]> =>
    ipcRenderer.invoke(IpcChannels.userFeedback.getPending),

  /** Send user's answer to a pending question/questionnaire. */
  answer: (response: UserFeedbackResponse): Promise<void> => {
    // Fire a DOM event synchronously so all renderer stores (Zustand, federated app)
    // can clear immediately — no IPC round-trip needed.
    window.dispatchEvent(
      new CustomEvent('sero:user-feedback:answered', { detail: { id: response.id } }),
    );
    return ipcRenderer.invoke(IpcChannels.userFeedback.answer, response);
  },

  /** Listen for incoming question/questionnaire requests from extensions. */
  onQuestion: (
    callback: (data: UserFeedbackPendingQuestion) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: UserFeedbackPendingQuestion,
    ) => callback(data);
    ipcRenderer.on(IpcChannels.userFeedback.question, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.userFeedback.question, handler);
    };
  },

  /** Listen for cancellation of a pending question. */
  onCancel: (callback: (data: { id: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string }) =>
      callback(data);
    ipcRenderer.on(IpcChannels.userFeedback.cancel, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.userFeedback.cancel, handler);
    };
  },
};
