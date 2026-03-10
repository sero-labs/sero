import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, Mic, SlidersHorizontal, Square } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@sero/ui/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero/ui/components/ui/tooltip';
import { cn } from '@sero/ui/lib/utils';
import {
  blobToDataUrl,
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
} from './voice-utils';

type VoicePhase = 'disabled' | 'idle' | 'starting' | 'recording' | 'processing' | 'error';

interface VoiceTranscriptionControlProps {
  disabled: boolean;
  onTranscript: (text: string) => void;
}

export function VoiceTranscriptionControl({
  disabled,
  onTranscript,
}: VoiceTranscriptionControlProps) {
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

  useEffect(() => {
    mountedRef.current = true;

    window.sero.voice.status()
      .then(async (status) => {
        if (!mountedRef.current) return;

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
        if (!mountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Voice transcription unavailable.';
        setPhase('disabled');
        setError(message);
      });

    return () => {
      mountedRef.current = false;
      clearTimer(timerRef);
      setDeviceMenuOpen(false);

      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
      recorderRef.current = null;

      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [refreshAudioInputs]);

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
        const result = await window.sero.voice.transcribe(dataUrl, blob.type || mimeType);

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
    [onTranscript],
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (phase === 'starting' || phase === 'recording' || phase === 'processing') return;

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
      streamRef.current = stream;
      if (fellBackToDefault) {
        setSelectedDeviceId('default');
      }

      const activeLabel = await resolveActiveInputLabel(stream, selectedDeviceId, audioInputs);
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

      setPhase('error');
      setError(formatMicError(err));
    }
  }, [audioInputs, finalizeRecording, phase, refreshAudioInputs, selectedDeviceId]);

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
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggle}
            disabled={micDisabled}
            className={cn(
              'relative rounded-md p-1.5 transition-all duration-150',
              phase === 'recording' && 'bg-[var(--voice-recording-muted)] text-[var(--voice-recording)] shadow-[0_0_0_2px_var(--voice-recording-muted)]',
              phase === 'starting' && 'bg-[var(--voice-processing-muted)] text-[var(--voice-processing)]',
              phase === 'processing' && 'bg-[var(--voice-processing-muted)] text-[var(--voice-processing)]',
              phase === 'error' && 'bg-[var(--status-warning-muted)] text-[var(--status-warning)]',
              phase === 'idle' && 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
              micDisabled && 'cursor-not-allowed opacity-50',
            )}
            title={micTooltip}
          >
            {phase === 'recording' && <Square className="size-3.5 fill-current" />}
            {phase === 'starting' && <Loader2 className="size-3.5 animate-spin" />}
            {phase === 'processing' && <Loader2 className="size-3.5 animate-spin" />}
            {phase === 'error' && <AlertCircle className="size-3.5" />}
            {phase === 'idle' && <Mic className="size-3.5" />}
            {phase === 'recording' && (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[var(--voice-recording)] animate-pulse" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] text-xs">
          {micTooltip}
        </TooltipContent>
      </Tooltip>

      <Popover open={deviceMenuOpen} onOpenChange={setDeviceMenuOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={selectorDisabled}
                className={cn(
                  'rounded-md p-1.5 text-[var(--text-muted)] transition-all duration-150 hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
                  selectorDisabled && 'cursor-not-allowed opacity-50',
                )}
                title={`Recording input: ${selectedDeviceLabel}`}
              >
                <SlidersHorizontal className="size-3.5" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-xs">
            {`Recording input: ${selectedDeviceLabel}`}
          </TooltipContent>
        </Tooltip>

        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-[280px] border-[var(--border-default)] bg-[var(--bg-surface)] p-2"
        >
          <div className="px-1 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Recording Input
          </div>

          {audioInputs.length === 0 ? (
            <div className="px-2 py-2 text-xs text-[var(--text-muted)]">No microphone devices detected.</div>
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
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]/70 hover:text-[var(--text-primary)]',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{input.label}</span>
                    {selected && <Check className="size-3.5 shrink-0 text-[var(--status-success)]" />}
                  </button>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
