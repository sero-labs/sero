/**
 * Host-side helpers around the OpenAI voice transcription assistant.
 *
 * These wrap credential resolution and the env-fallback retry so both the
 * IPC handler (used by the renderer) and the gateway request handler (used
 * by web-remote) can share the same behaviour.
 */

import { getEnvApiKey } from '@mariozechner/pi-ai';

import type {
  VoiceTranscriptionResult,
  VoiceTranscriptionStatus,
} from '@/types/ipc';
import { ensureInfra } from '@electron/shared/infra/shared-infra';
import {
  getVoiceTranscriptionStatus,
  transcribeWithOpenAi,
} from '@electron/features/agent/assistants/voice-transcription';

export interface ResolvedOpenAiKeys {
  primaryKey: string;
  fallbackKey: string;
}

export async function resolveOpenAiApiKeys(): Promise<ResolvedOpenAiKeys> {
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

export function runVoiceStatus(keys: ResolvedOpenAiKeys): VoiceTranscriptionStatus {
  return getVoiceTranscriptionStatus(keys.primaryKey || keys.fallbackKey);
}

export async function runVoiceTranscribe(
  keys: ResolvedOpenAiKeys,
  audioDataUrl: string,
  mimeType?: string,
): Promise<VoiceTranscriptionResult> {
  try {
    return await transcribeWithOpenAi(audioDataUrl, mimeType, keys.primaryKey);
  } catch (err) {
    if (shouldRetryWithEnvFallback(err, keys.primaryKey, keys.fallbackKey)) {
      return transcribeWithOpenAi(audioDataUrl, mimeType, keys.fallbackKey);
    }
    throw err;
  }
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
