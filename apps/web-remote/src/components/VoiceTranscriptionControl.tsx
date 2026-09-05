/**
 * Voice transcription control for web-remote.
 *
 * Captures microphone audio in the browser, encodes it as a base64 data URL
 * and sends it to the desktop host over the gateway, where the existing
 * OpenAI transcription helper runs. The transcript is appended to the chat
 * input. Mirrors the desktop control but without the Electron preload bridge.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, Mic, SlidersHorizontal, Square } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import { useIsMobile } from '@sero-ai/ui/hooks/use-mobile';
import { cn } from '@sero-ai/ui/lib/utils';

import {
  blobToDataUrl,
  cleanupRecordingRefs,
  clearTimer,
  formatInputLabel,
  formatMicError,
  formatMs,
  pickRecorderMimeType,
  requestAudioStream,
  resolveActiveInputLabel,
  resolveDeviceSelection,
  stopStream,
  type AudioInputOption,
} from '@/lib/voice-utils';
import type { GatewayClientLike } from '@/stores/connection';

type VoicePhase = 'disabled' | 'idle' | 'starting' | 'recording' | 'processing' | 'error';

interface VoiceTranscriptionControlProps {
  client: GatewayClientLike;
  /**
   * Whether the gateway connection is ready to accept requests. The control
   * waits for this to be true before probing voice status, otherwise the
   * status check would race the WebSocket handshake and disable itself.
   */
  isConnected: boolean;
  disabled: boolean;
  onTranscript: (text: string) => void;
}

export function VoiceTranscriptionControl({
  client,
  isConnected,
  disabled,
  onTranscript,
}: VoiceTranscriptionControlProps) {
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState<VoicePhase>('disabled');
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioInputs, setAudioInputs] = useState<AudioInputOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('default');
  const [lastRecordingDeviceLabel, setLastRecordingDeviceLabel] = useState<string>('');
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const isConnectedRef = useRef(isConnected);
  const startAttemptRef = useRef(0);
  isConnectedRef.current = isConnected;
  const supportsCapture = useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== 'undefined',
    [],
  );

  const refreshAudioInputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!mountedRef.current) return;

      const inputs = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({
          id: device.deviceId,
          label: formatInputLabel(device.label, index),
        }));

      setAudioInputs(inputs);
      setSelectedDeviceId((prev) => resolveDeviceSelection(prev, inputs));
    } catch {
      if (!mountedRef.current) return;
      setAudioInputs([]);
      setSelectedDeviceId('default');
    }
  }, []);

  /**
   * Tear down any active recording: clears the elapsed timer, detaches the
   * recorder's onstop so it doesn't try to finalize through the (possibly
   * gone) gateway, stops the recorder, and releases the microphone stream.
   *
   * Called on unmount and on disconnect, leaving these resources alive
   * after the gateway drops would keep the mic LED on while the user has
   * no UI to stop it.
   */
  const cleanupRecording = useCallback(() => {
    startAttemptRef.current += 1;
    cleanupRecordingRefs({ recorderRef, streamRef, timerRef });
  }, []);

  // Cleanup on unmount: stop any active recording / stream / timer.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupRecording();
      setDeviceMenuOpen(false);
    };
  }, [cleanupRecording]);

  // Probe the host's voice transcription availability. Re-runs when the
  // gateway connection comes up so the control doesn't latch into the
  // 'disabled' state if the user opens the chat before authentication
  // finishes.
  useEffect(() => {
    if (!supportsCapture) {
      setPhase('disabled');
      setError('Voice transcription requires a browser with microphone support over HTTPS.');
      return;
    }

    if (!isConnected) {
      // Reset to a neutral 'disabled' state and tear down any in-flight
      // recording so the mic doesn't keep capturing in the background after
      // the UI hides.
      cleanupRecording();
      setPhase('disabled');
      setError(null);
      setElapsedMs(0);
      setDeviceMenuOpen(false);
      return;
    }

    let cancelled = false;
    setPhase('disabled');
    setError(null);

    client
      .voiceStatus()
      .then(async (status) => {
        if (cancelled || !mountedRef.current) return;

        if (!status.enabled) {
          setPhase('disabled');
          setError(status.reason ?? null);
          return;
        }

        setPhase('idle');
        setError(null);
        await refreshAudioInputs();
      })
      .catch((err) => {
        if (cancelled || !mountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Voice transcription unavailable.';
        setPhase('disabled');
        setError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [client, cleanupRecording, isConnected, refreshAudioInputs, supportsCapture]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;

    const handleDeviceChange = () => {
      void refreshAudioInputs();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshAudioInputs]);

  const selectedDeviceLabel = useMemo(() => {
    const selected = audioInputs.find((input) => input.id === selectedDeviceId);
    if (selected) return selected.label;

    const defaultInput = audioInputs.find((input) => input.id === 'default');
    if (defaultInput) return defaultInput.label;

    if (audioInputs[0]) return audioInputs[0].label;
    return 'System default input';
  }, [audioInputs, selectedDeviceId]);

  const finalizeRecording = useCallback(
    async (chunks: BlobPart[], mimeType: string) => {
      clearTimer(timerRef);

      stopStream(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;

      if (!mountedRef.current) return;

      const blob = new Blob(chunks, { type: mimeType });
      if (!blob.size) {
        setPhase('error');
        setError('No audio was captured. Try speaking for a little longer.');
        return;
      }

      setPhase('processing');
      setElapsedMs(0);

      try {
        const dataUrl = await blobToDataUrl(blob);
        const result = await client.transcribeVoice(dataUrl, blob.type || mimeType);

        if (!mountedRef.current) return;

        if (result.text.trim()) {
          onTranscript(result.text.trim());
        }

        setPhase('idle');
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Transcription failed.';
        setPhase('error');
        setError(message);
      }
    },
    [client, onTranscript],
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (phase === 'starting' || phase === 'recording' || phase === 'processing') return;

    const startAttempt = startAttemptRef.current + 1;
    startAttemptRef.current = startAttempt;
    const isCurrentStart = () =>
      mountedRef.current && isConnectedRef.current && startAttemptRef.current === startAttempt;

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('error');
      setError('Microphone capture is not available in this environment.');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setPhase('error');
      setError('MediaRecorder is not supported here.');
      return;
    }

    setPhase('starting');
    try {
      setError(null);
      const { stream, fellBackToDefault } = await requestAudioStream(selectedDeviceId);
      if (!isCurrentStart()) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      if (fellBackToDefault) {
        setSelectedDeviceId('default');
      }

      const activeLabel = await resolveActiveInputLabel(stream, selectedDeviceId, audioInputs);
      if (!isCurrentStart()) {
        cleanupRecording();
        return;
      }
      setLastRecordingDeviceLabel(activeLabel);
      void refreshAudioInputs();

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const chunks: BlobPart[] = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onerror = () => {
        if (!mountedRef.current) return;
        cleanupRecording();
        setPhase('error');
        setError('Microphone recording failed.');
      };

      recorder.onstop = () => {
        void finalizeRecording(chunks, recorder.mimeType || mimeType || 'audio/webm');
      };

      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setPhase('recording');

      clearTimer(timerRef);
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 125);

      recorder.start(250);
    } catch (err) {
      stopStream(streamRef.current);
      streamRef.current = null;

      if (!isCurrentStart()) return;
      setPhase('error');
      setError(formatMicError(err));
    }
  }, [audioInputs, cleanupRecording, finalizeRecording, phase, refreshAudioInputs, selectedDeviceId]);

  const onToggle = useCallback(() => {
    if (phase === 'recording') {
      stopRecording();
      return;
    }
    if (phase === 'starting' || phase === 'processing') return;
    void startRecording();
  }, [phase, startRecording, stopRecording]);

  const visible = phase !== 'disabled';
  const micDisabled = phase === 'starting' || phase === 'processing' || (disabled && phase !== 'recording');
  const selectorDisabled = disabled || phase === 'starting' || phase === 'recording' || phase === 'processing';

  const micTooltip = useMemo(() => {
    if (phase === 'recording') {
      const src = lastRecordingDeviceLabel || selectedDeviceLabel;
      return `Recording from ${src}. Click to stop (${formatMs(elapsedMs)}).`;
    }
    if (phase === 'starting') {
      return 'Starting microphone...';
    }
    if (phase === 'processing') {
      return 'Transcribing audio with OpenAI...';
    }
    if (phase === 'error') {
      return error ?? 'Voice transcription failed. Click to retry.';
    }
    return 'Record voice message';
  }, [elapsedMs, error, lastRecordingDeviceLabel, phase, selectedDeviceLabel]);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={micDisabled}
        title={micTooltip}
        aria-label={micTooltip}
        className={cn(
          'relative inline-flex size-9 items-center justify-center rounded-md transition-colors',
          phase === 'recording' && 'bg-destructive/15 text-destructive',
          phase === 'starting' && 'text-muted-foreground',
          phase === 'processing' && 'text-muted-foreground',
          phase === 'error' && 'text-status-warning',
          phase === 'idle' && 'text-muted-foreground hover:bg-accent hover:text-foreground',
          micDisabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {phase === 'recording' && <Square className="size-4 fill-current" />}
        {phase === 'starting' && <Loader2 className="size-4 animate-spin" />}
        {phase === 'processing' && <Loader2 className="size-4 animate-spin" />}
        {phase === 'error' && <AlertCircle className="size-4" />}
        {phase === 'idle' && <Mic className="size-4" />}
        {phase === 'recording' && (
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive animate-pulse" />
        )}
      </button>

      {/* Hide the device picker on small screens, phones expose only the system default mic. */}
      {!isMobile && (
        <Popover open={deviceMenuOpen} onOpenChange={setDeviceMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={selectorDisabled}
              title={`Recording input: ${selectedDeviceLabel}`}
              aria-label={`Recording input: ${selectedDeviceLabel}`}
              className={cn(
                'inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                selectorDisabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <SlidersHorizontal className="size-4" />
            </button>
          </PopoverTrigger>

          <PopoverContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-[280px] p-2"
          >
            <div className="px-1 pb-2 pt-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recording Input
            </div>

            {audioInputs.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground">
                No microphone devices detected.
              </div>
            ) : (
              <div className="max-h-60 space-y-1 overflow-y-auto">
                {audioInputs.map((input) => {
                  const selected = input.id === selectedDeviceId;
                  return (
                    <button
                      key={input.id}
                      type="button"
                      onClick={() => {
                        setSelectedDeviceId(input.id);
                        setDeviceMenuOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                        selected
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{input.label}</span>
                      {selected && <Check className="size-3.5 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
