import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useAI, useAppState, useAppTools } from '@sero-ai/app-runtime';

import {
  DEFAULT_LOOM_STATE,
  normalizeLoomState,
  type LoomPreset,
  type LoomPiece,
  type LoomSettings,
  type LoomState,
  type ParamValue,
} from '../shared/types';
import { CodePanel } from './components/CodePanel';
import { ControlsPanel } from './components/ControlsPanel';
import { GalleryPanel } from './components/GalleryPanel';
import { IconRail, type PanelId } from './components/IconRail';
import { PromptBar } from './components/PromptBar';
import { SettingsPanel } from './components/SettingsPanel';
import { useLoomRuntime } from './hooks/useLoomRuntime';
import {
  captureDims,
  debounced,
  deletePreset,
  loadPreset,
  savePreset,
  setDirection,
  setParamValues,
  setPiece,
  updateSettings,
  writeBuild,
  writeSeeError,
} from './lib/loom-ui';
import './styles.css';

const IDLE_HIDE_MS = 4000;
const WAKE_THROTTLE_MS = 250;

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function LoomApp() {
  const [rawState, updateState] = useAppState<LoomState>(DEFAULT_LOOM_STATE);
  const state = useMemo(() => normalizeLoomState(rawState), [rawState]);

  const ai = useAI();
  const tools = useAppTools();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Referentially stable piece so the compile effect only fires on real change.
  const pieceKey = useMemo(() => JSON.stringify(state.piece), [state.piece]);
  const piece = useMemo(() => state.piece, [pieceKey]);

  const [capturing, setCapturing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applyingDirection, setApplyingDirection] = useState(false);
  const [promptStatus, setPromptStatus] = useState('');
  const [toast, setToast] = useState('');

  const { ready, error, capture, seeFrames } = useLoomRuntime(canvasRef, containerRef, {
    piece,
    revision: state.revision,
    speed: state.settings.speed,
    paused: state.settings.paused,
    transitionMs: state.settings.transitionMs,
    onBuild: (report) => writeBuild(updateState, report),
    onGpuHostileRevert: (reverted) => {
      setPiece(updateState, reverted);
      setToast('That piece kept crashing the GPU — reverted to the previous one.');
    },
  });

  // ── Chrome visibility (auto-hide + ambient mode) ──────────────
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [ambient, setAmbient] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleRef = useRef(false);
  const lastWakeRef = useRef(-Infinity);

  const wake = useCallback(() => {
    const now = performance.now();
    if (!idleRef.current && now - lastWakeRef.current < WAKE_THROTTLE_MS) return;
    lastWakeRef.current = now;
    idleRef.current = false;
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      idleRef.current = true;
      setIdle(true);
    }, IDLE_HIDE_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [wake]);
  const onPromptBusyChange = useCallback(
    (busy: boolean) => {
      setGenerating(busy);
      wake();
    },
    [wake],
  );

  const chromeVisible = !ambient && (!idle || panel !== null || generating);
  const onTogglePanel = useCallback((id: PanelId) => setPanel((p) => (p === id ? null : id)), []);
  const onTogglePause = useCallback(() => updateSettings(updateState, (s) => { s.paused = !s.paused; }), [updateState]);
  const onAmbient = useCallback(() => setAmbient(true), []);
  const onCanvasDoubleClick = useCallback(() => setAmbient((v) => !v), []);
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      wake();
      if (e.key === 'Escape') setAmbient(false);
    },
    [wake],
  );

  // ── Params (optimistic local echo + debounced state write) ────
  const [pendingParams, setPendingParams] = useState<Record<string, ParamValue>>({});
  const pendingRef = useRef(pendingParams);
  pendingRef.current = pendingParams;
  const flushParams = useMemo(
    () =>
      debounced(200, () => {
        const values = pendingRef.current;
        if (Object.keys(values).length === 0) return;
        setParamValues(updateState, values);
        setPendingParams({});
      }),
    [updateState],
  );
  const onParam = useCallback(
    (name: string, value: ParamValue) => {
      setPendingParams((prev) => ({ ...prev, [name]: value }));
      flushParams();
    },
    [flushParams],
  );
  const onLoadPreset = useCallback((id: string) => loadPreset(updateState, id), [updateState]);
  const onDeletePreset = useCallback((id: string) => deletePreset(updateState, id), [updateState]);
  const onApplyCode = useCallback((next: LoomPiece) => setPiece(updateState, next), [updateState]);
  const onSettingsChange = useCallback((recipe: (s: LoomSettings) => void) => updateSettings(updateState, recipe), [updateState]);
  const displayPiece = useMemo(
    () => (Object.keys(pendingParams).length === 0 ? piece : { ...piece, paramValues: { ...piece.paramValues, ...pendingParams } }),
    [piece, pendingParams],
  );

  // ── Agent's eyes: fulfil loom_see requests ─────────────────────
  const handledSee = useRef<string | null>(null);
  useEffect(() => {
    const req = state.seeRequest;
    if (!req || !ready || handledSee.current === req.id) return;
    handledSee.current = req.id;
    try {
      const frames = seeFrames(req.width, req.frames, req.spacingSeconds);
      void tools
        .run('loom_capture', { purpose: 'see', requestId: req.id, dataUrls: frames })
        .catch((err: unknown) => writeSeeError(updateState, req.id, err instanceof Error ? err.message : 'capture tool failed'));
    } catch (err) {
      writeSeeError(updateState, req.id, err instanceof Error ? err.message : 'render failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.seeRequest?.id, ready]);

  // ── Wallpaper capture ─────────────────────────────────────────
  const onCapture = useCallback(async () => {
    if (capturing || !ready) return;
    setCapturing(true);
    setToast('Rendering…');
    const dims = captureDims(state.settings);
    try {
      const dataUrl = capture(dims.w, dims.h);
      try {
        const res = await tools.run('loom_capture', {
          dataUrl,
          width: dims.w,
          height: dims.h,
          name: state.piece.title,
          writeSidecar: state.settings.capture.writeSidecarConfig,
        });
        setToast(res.text || `Saved ${dims.w}×${dims.h}`);
      } catch {
        downloadDataUrl(dataUrl, `loom-${dims.w}x${dims.h}.png`);
        setToast(`Downloaded ${dims.w}×${dims.h} (tool save unavailable)`);
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Capture failed');
    } finally {
      setCapturing(false);
    }
  }, [capture, capturing, ready, state.piece.title, state.settings, tools]);
  const onCaptureClick = useCallback(() => void onCapture(), [onCapture]);

  // ── Gallery actions ───────────────────────────────────────────
  const onSave = useCallback(
    (name: string) => {
      let thumbnail: string | undefined;
      try {
        thumbnail = seeFrames(320, 1, 0)[0];
      } catch {
        thumbnail = undefined;
      }
      savePreset(updateState, name, thumbnail);
    },
    [seeFrames, updateState],
  );
  const onFork = useCallback(
    (preset: LoomPreset) => {
      setPanel(null);
      void ai.prompt(
        `Riff on the saved Loom piece "${preset.name}" (id ${preset.id}): load it with loom_preset` +
          `${preset.piece ? '' : ' (it is legacy — recreate its look as GLSL from the returned graph JSON)'}, ` +
          'then compose a fresh variation that keeps its essence but pushes somewhere new. ' +
          'Fix any compile errors, then loom_see once and refine only if it is clearly broken. Reply with one short sentence.',
      );
    },
    [ai],
  );

  const onApplyDirection = useCallback(
    async (guidance: string) => {
      const trimmed = guidance.trim();
      setDirection(updateState, trimmed);
      if (!trimmed) {
        setPromptStatus('Creative direction cleared.');
        return;
      }
      if (applyingDirection) return;

      setApplyingDirection(true);
      setGenerating(true);
      setPromptStatus('Applying creative direction…');
      wake();
      try {
        const reply = await ai.prompt(
          `Apply this persistent Loom creative direction to the current piece now: ${JSON.stringify(trimmed)}. ` +
            'Call loom_get first, then update the current GLSL with loom_compose. ' +
            'Keep it GPU-light, fix compile errors, call loom_see once, and reply with one short sentence.',
        );
        setPromptStatus(reply.trim().slice(0, 200) || 'Creative direction applied.');
      } catch (err) {
        setPromptStatus(err instanceof Error ? err.message : 'Failed to apply creative direction');
      } finally {
        setApplyingDirection(false);
        setGenerating(false);
        wake();
      }
    },
    [ai, applyingDirection, updateState, wake],
  );

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onPointerMove={wake}
      onKeyDown={onKeyDown}
      className="relative size-full overflow-hidden bg-background text-foreground outline-none"
    >
      <canvas ref={canvasRef} onDoubleClick={onCanvasDoubleClick} className="block size-full" />

      {(!ready || error) && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <div className="max-w-sm rounded-xl border border-border bg-background/80 p-4 backdrop-blur">
            {error ? (
              <>
                <p className="text-sm font-medium text-destructive">Renderer unavailable</p>
                <p className="mt-1 text-xs text-muted-foreground">WebGL2 could not initialize. {error}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Initializing renderer…</p>
            )}
          </div>
        </div>
      )}

      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${chromeVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <PromptBar
            ai={ai}
            direction={state.direction.guidance}
            externalBusy={applyingDirection}
            externalStatus={promptStatus}
            onBusyChange={onPromptBusyChange}
          />
        </div>

        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <IconRail
            active={panel}
            onToggle={onTogglePanel}
            paused={state.settings.paused}
            onTogglePause={onTogglePause}
            onCapture={onCaptureClick}
            capturing={capturing}
            onAmbient={onAmbient}
            buildError={state.build?.status === 'error'}
          />
        </div>

        {panel !== null && (
          <div className="absolute bottom-16 right-16 top-4 flex items-start justify-end">
            {panel === 'controls' && (
              <ControlsPanel
                piece={displayPiece}
                direction={state.direction.guidance}
                onParam={onParam}
                onApplyDirection={onApplyDirection}
                applyingDirection={applyingDirection}
              />
            )}
            {panel === 'gallery' && (
              <GalleryPanel
                presets={state.presets}
                onSave={onSave}
                onLoad={onLoadPreset}
                onDelete={onDeletePreset}
                onFork={onFork}
              />
            )}
            {panel === 'code' && <CodePanel piece={piece} build={state.build} onApply={onApplyCode} />}
            {panel === 'settings' && (
              <SettingsPanel settings={state.settings} onChange={onSettingsChange} />
            )}
          </div>
        )}

        {toast && (
          <button
            type="button"
            onClick={() => setToast('')}
            className="pointer-events-auto absolute bottom-4 right-3 max-w-xs truncate rounded-full border border-border bg-background/85 px-3 py-1.5 text-[11px] text-muted-foreground shadow backdrop-blur"
          >
            {toast}
          </button>
        )}
      </div>
    </div>
  );
}

export default LoomApp;
