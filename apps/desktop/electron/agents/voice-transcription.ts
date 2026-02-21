import type {
  VoiceTranscriptionResult,
  VoiceTranscriptionStatus,
} from '../../src/types/ipc';

const OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB API limit
const TRANSCRIBE_TIMEOUT_MS = 60_000;

const MIME_TO_EXTENSION: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
};

interface ParsedAudioData {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

interface OpenAiErrorShape {
  error?: {
    message?: string;
  };
}

interface OpenAiTranscriptionResponse {
  text?: string;
  transcript?: string;
  output_text?: string;
  result?: {
    text?: string;
    transcript?: string;
  };
  segments?: Array<{ text?: string }>;
}

export function getVoiceTranscriptionStatus(apiKey?: string): VoiceTranscriptionStatus {
  if (apiKey?.trim()) {
    return { enabled: true };
  }

  return {
    enabled: false,
    reason: 'Voice transcription requires an OpenAI API key (Settings or OPENAI_API_KEY).',
  };
}

export async function transcribeWithOpenAi(
  audioDataUrl: string,
  mimeType?: string,
  apiKey?: string,
): Promise<VoiceTranscriptionResult> {
  const key = apiKey?.trim();
  if (!key) {
    throw new Error('OpenAI API key is missing.');
  }

  const audio = parseAudioData(audioDataUrl, mimeType);

  const form = new FormData();
  const file = new Blob([audio.buffer], { type: audio.mimeType });
  form.append('file', file, `voice-note.${audio.extension}`);
  form.append('model', OPENAI_TRANSCRIBE_MODEL);
  // Force plain text output so the response shape is stable across SDK/API changes.
  form.append('response_format', 'text');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
      },
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error('Transcription timed out after 60 seconds. Please try a shorter recording.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const details = await readOpenAiError(response);
    throw new Error(`Transcription failed (${response.status}): ${details}`);
  }

  const text = await readTranscriptionText(response);
  if (!text) {
    throw new Error('No speech detected. Try speaking a little longer and closer to your microphone.');
  }

  return {
    text,
    model: `openai/${OPENAI_TRANSCRIBE_MODEL}`,
  };
}

function parseAudioData(audioDataUrl: string, mimeTypeOverride?: string): ParsedAudioData {
  if (typeof audioDataUrl !== 'string') {
    throw new Error('Audio payload is invalid.');
  }

  const match = audioDataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/);
  if (!match) {
    throw new Error('Audio payload must be a base64 data URL.');
  }

  const mimeType = normalizeMimeType(mimeTypeOverride) || normalizeMimeType(match[1]);
  if (!mimeType || !mimeType.startsWith('audio/')) {
    throw new Error('Recorded media is not a supported audio type.');
  }

  const base64 = match[2].replace(/\s+/g, '');
  const buffer = Buffer.from(base64, 'base64');

  if (!buffer.length) {
    throw new Error('Recorded audio is empty.');
  }

  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error('Recorded audio is too large (max 25MB).');
  }

  return {
    buffer,
    mimeType,
    extension: MIME_TO_EXTENSION[mimeType] ?? 'webm',
  };
}

function normalizeMimeType(value?: string): string {
  if (!value) return '';
  return value.toLowerCase().split(';')[0].trim();
}

async function readOpenAiError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      const json = (await response.json()) as OpenAiErrorShape;
      if (json.error?.message) return json.error.message;
    } catch {
      // fall through to status text
    }
  } else {
    try {
      const text = (await response.text()).trim();
      if (text) return text;
    } catch {
      // fall through to status text
    }
  }

  return response.statusText || 'Unknown OpenAI API error';
}

async function readTranscriptionText(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  const raw = (await response.text()).trim();
  if (!raw) return '';

  if (contentType.includes('application/json') || raw.startsWith('{')) {
    try {
      const json = JSON.parse(raw) as OpenAiTranscriptionResponse;
      return extractJsonTranscript(json);
    } catch {
      // Fall through to plain text.
    }
  }

  return raw;
}

function extractJsonTranscript(data: OpenAiTranscriptionResponse): string {
  const direct = firstText(data.text, data.transcript, data.output_text);
  if (direct) return direct;

  const nested = firstText(data.result?.text, data.result?.transcript);
  if (nested) return nested;

  if (Array.isArray(data.segments)) {
    const fromSegments = data.segments
      .map((segment) => (typeof segment?.text === 'string' ? segment.text.trim() : ''))
      .filter(Boolean)
      .join(' ')
      .trim();
    if (fromSegments) return fromSegments;
  }

  return '';
}

function firstText(...values: Array<string | undefined>): string {
  for (const value of values) {
    const text = value?.trim();
    if (text) return text;
  }
  return '';
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
