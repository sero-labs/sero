import { ipcMain } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import type {
  VoiceTranscriptionResult,
  VoiceTranscriptionStatus,
} from '@/types/ipc';
import {
  resolveOpenAiApiKeys,
  runVoiceStatus,
  runVoiceTranscribe,
} from '@electron/features/agent/assistants/voice-transcription-host';

export function registerVoiceHandlers(): void {
  ipcMain.handle(
    IpcChannels.voice.status,
    async (): Promise<VoiceTranscriptionStatus> => {
      const keys = await resolveOpenAiApiKeys();
      return runVoiceStatus(keys);
    },
  );

  ipcMain.handle(
    IpcChannels.voice.transcribe,
    async (
      _event,
      audioDataUrl: string,
      mimeType?: string,
    ): Promise<VoiceTranscriptionResult> => {
      const keys = await resolveOpenAiApiKeys();
      return runVoiceTranscribe(keys, audioDataUrl, mimeType);
    },
  );
}
