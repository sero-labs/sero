/**
 * Browser-safe microphone capture helpers shared by the web-remote voice
 * control. Mirrors `apps/desktop/src/components/layout/voice-utils.ts` and
 * uses only standard web APIs (MediaRecorder, navigator.mediaDevices,
 * FileReader). The desktop version stays separate for now because it ships
 * inside the Electron renderer; if either grows we can extract them into a
 * shared web module.
 */

const RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

export interface AudioInputOption {
  id: string;
  label: string;
}

export function formatInputLabel(label: string, index: number): string {
  const trimmed = label.trim();
  if (trimmed) return trimmed;
  return `Microphone ${index + 1}`;
}

export function resolveDeviceSelection(current: string, inputs: AudioInputOption[]): string {
  if (!inputs.length) return 'default';
  if (inputs.some((input) => input.id === current)) return current;

  const defaultInput = inputs.find((input) => input.id === 'default');
  if (defaultInput) return defaultInput.id;
  return inputs[0].id;
}

export async function requestAudioStream(
  selectedDeviceId: string,
): Promise<{ stream: MediaStream; fellBackToDefault: boolean }> {
  if (selectedDeviceId && selectedDeviceId !== 'default') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: selectedDeviceId } },
      });
      return { stream, fellBackToDefault: false };
    } catch (err) {
      if (isDeviceSelectionError(err)) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        return { stream, fellBackToDefault: true };
      }
      throw err;
    }
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return { stream, fellBackToDefault: false };
}

export async function resolveActiveInputLabel(
  stream: MediaStream,
  selectedDeviceId: string,
  inputs: AudioInputOption[],
): Promise<string> {
  const track = stream.getAudioTracks()[0];
  const settingsDeviceId = track?.getSettings().deviceId;

  if (settingsDeviceId) {
    const exact = inputs.find((input) => input.id === settingsDeviceId);
    if (exact) return exact.label;
  }

  const selected = inputs.find((input) => input.id === selectedDeviceId);
  if (selected) return selected.label;

  if (inputs[0]) return inputs[0].label;
  return 'System default input';
}

export function formatMicError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') {
      return 'Microphone access was denied. Allow access in your browser settings.';
    }
    if (err.name === 'NotFoundError') {
      return 'No microphone input was found.';
    }
    if (err.name === 'NotReadableError') {
      return 'The selected input is busy or unavailable.';
    }
    if (err.name === 'SecurityError') {
      return 'Microphone access is blocked. Voice transcription requires HTTPS.';
    }
  }

  if (err instanceof Error) return err.message;
  return 'Microphone access failed.';
}

export function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mimeType of RECORDING_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return '';
}

export function clearTimer(timerRef: { current: number | null }): void {
  if (timerRef.current === null) return;
  window.clearInterval(timerRef.current);
  timerRef.current = null;
}

export function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to encode audio recording.'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read recorded audio.'));
    };
    reader.readAsDataURL(blob);
  });
}

export function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function isDeviceSelectionError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  return err.name === 'OverconstrainedError' || err.name === 'NotFoundError';
}
