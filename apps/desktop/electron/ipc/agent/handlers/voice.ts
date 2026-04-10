import { ipcMain } from 'electron';
import { getEnvApiKey } from '@mariozechner/pi-ai';

import { IpcChannels } from '@/types/ipc';
import type {
  VoiceTranscriptionResult,
  VoiceTranscriptionStatus,
} from '@/types/ipc';
import { ensureInfra } from '@electron/shared/infra/shared-infra';
import {
  getVoiceTranscriptionStatus,
  transcribeWithOpenAi,
} from '@electron/features/agent/assistants/voice-transcription';

export function registerVoiceHandlers(): void {
  ipcMain.handle(
    IpcChannels.voice.status,
    async (): Promise<VoiceTranscriptionStatus> => {
      const { primaryKey, fallbackKey } = await resolveOpenAiApiKeys();
      return getVoiceTranscriptionStatus(primaryKey || fallbackKey);
    },
  );

  ipcMain.handle(
    IpcChannels.voice.transcribe,
    async (
      _event,
      audioDataUrl: string,
      mimeType?: string,
    ): Promise<VoiceTranscriptionResult> => {
      const { primaryKey, fallbackKey } = await resolveOpenAiApiKeys();
      try {
        return await transcribeWithOpenAi(audioDataUrl, mimeType, primaryKey);
      } catch (err) {
        if (shouldRetryWithEnvFallback(err, primaryKey, fallbackKey)) {
          return transcribeWithOpenAi(audioDataUrl, mimeType, fallbackKey);
        }
        throw err;
      }
    },
  );
}

async function resolveOpenAiApiKeys(): Promise<{ primaryKey: string; fallbackKey: string }> {
  const envKey = getEnvApiKey('openai')?.trim() ?? process.env.OPENAI_API_KEY?.trim() ?? '';

  try {
    const infra = await ensureInfra();
    const stored = infra.authStorage.get('openai');
    if (stored?.type === 'api_key' && stored.key.trim()) {
      const primaryKey = stored.key.trim();
      const fallbackKey = primaryKey === envKey ? '' : envKey;
      return { primaryKey, fallbackKey };
    }
  } catch {
    // Fall back to env-only auth when shared infra is unavailable.
  }

  return { primaryKey: envKey, fallbackKey: '' };
}

function shouldRetryWithEnvFallback(
  err: unknown,
  primaryKey: string,
  fallbackKey: string,
): boolean {
  if (!primaryKey || !fallbackKey || primaryKey === fallbackKey) return false;
  if (!(err instanceof Error)) return false;
  return err.message.includes('Transcription failed (401)')
    || err.message.includes('Transcription failed (403)')
    || err.message.includes('OpenAI API key is missing');
}
