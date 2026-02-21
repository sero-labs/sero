import { ipcMain } from 'electron';

import { IpcChannels } from '../../src/types/ipc';
import type {
  VoiceTranscriptionResult,
  VoiceTranscriptionStatus,
} from '../../src/types/ipc';
import {
  getVoiceTranscriptionStatus,
  transcribeWithOpenAi,
} from '../agents/voice-transcription';

export function registerVoiceHandlers(): void {
  ipcMain.handle(
    IpcChannels.voice.status,
    async (): Promise<VoiceTranscriptionStatus> => getVoiceTranscriptionStatus(),
  );

  ipcMain.handle(
    IpcChannels.voice.transcribe,
    async (
      _event,
      audioDataUrl: string,
      mimeType?: string,
    ): Promise<VoiceTranscriptionResult> => transcribeWithOpenAi(audioDataUrl, mimeType),
  );
}
