import { useCallback, useMemo, useRef, useState } from 'react';
import { useAI, useAppState, useAppTools } from '@sero-ai/app-runtime';

import {
  DEFAULT_LOOM_STATE,
  clampConfig,
  normalizeLoomState,
  structuredCloneState,
  type LoomState,
} from '../shared/types';
import { ControlPanel } from './components/ControlPanel';
import { Gallery } from './components/Gallery';
import { MoodBox } from './components/MoodBox';
import { PaletteEditor } from './components/PaletteEditor';
import { Transport } from './components/Transport';
import { useLoomEngine } from './hooks/useLoomEngine';
import { captureDims, updateLive, updateSettings } from './lib/loom-ui';
import './styles.css';

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
  const state = normalizeLoomState(rawState);

  const ai = useAI();
  const tools = useAppTools();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Referentially stable live config (so the engine only re-syncs on real change).
  const liveKey = JSON.stringify(state.live);
  const live = useMemo(() => state.live, [liveKey]);

  const { backend, ready, error, capture } = useLoomEngine(canvasRef, containerRef, {
    config: live,
    paused: state.settings.paused,
    backend: state.settings.rendererBackend,
  });

  const [capturing, setCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState('');

  const onLive = useCallback((recipe: Parameters<typeof updateLive>[1]) => updateLive(updateState, recipe), [updateState]);
  const onSettings = useCallback((recipe: Parameters<typeof updateSettings>[1]) => updateSettings(updateState, recipe), [updateState]);

  const onSave = useCallback(
    (name: string) => {
      updateState((prev) => {
        const s = normalizeLoomState(prev);
        const id = `piece-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
        return {
          ...s,
          presets: [...s.presets, { id, name, createdAt: Date.now(), config: structuredCloneState(s.live) }],
        };
      });
    },
    [updateState],
  );

  const onLoad = useCallback(
    (id: string) => {
      updateState((prev) => {
        const s = normalizeLoomState(prev);
        const p = s.presets.find((x) => x.id === id);
        return p ? { ...s, live: clampConfig(p.config) } : s;
      });
    },
    [updateState],
  );

  const onDelete = useCallback(
    (id: string) => {
      updateState((prev) => {
        const s = normalizeLoomState(prev);
        return { ...s, presets: s.presets.filter((x) => x.id !== id) };
      });
    },
    [updateState],
  );

  const onCapture = useCallback(async () => {
    if (capturing || !ready) return;
    setCapturing(true);
    setCaptureMsg('Rendering…');
    const dims = captureDims(state.settings);
    try {
      const dataUrl = await capture(dims.w, dims.h);
      try {
        const res = await tools.run('loom_capture', {
          dataUrl,
          width: dims.w,
          height: dims.h,
          name: 'loom',
          writeSidecar: state.settings.capture.writeSidecarConfig,
        });
        setCaptureMsg(res.text || `Saved ${dims.w}×${dims.h}`);
      } catch {
        // Fallback: hand the file straight to the browser.
        downloadDataUrl(dataUrl, `loom-${dims.w}x${dims.h}.png`);
        setCaptureMsg(`Downloaded ${dims.w}×${dims.h} (tool save unavailable)`);
      }
    } catch (err) {
      setCaptureMsg(err instanceof Error ? err.message : 'Capture failed');
    } finally {
      setCapturing(false);
    }
  }, [capture, capturing, ready, state.settings, tools]);

  return (
    <div className="flex size-full overflow-hidden bg-background text-foreground">
      {/* Stage */}
      <div ref={containerRef} className="relative min-w-0 flex-1">
        <canvas ref={canvasRef} className="block size-full" />
        {(!ready || error) && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <div className="max-w-sm rounded-lg border border-border bg-background/80 p-4 backdrop-blur">
              {error ? (
                <>
                  <p className="text-sm font-medium text-destructive">Renderer unavailable</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    WebGPU and WebGL could not initialize on this device. {error}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Initializing renderer…</p>
              )}
            </div>
          </div>
        )}
        {ready && (
          <span className="absolute left-3 top-3 rounded-full border border-border bg-background/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
            {backend}
          </span>
        )}
      </div>

      {/* Control panel */}
      <aside className="flex w-[320px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-background p-4">
        <header className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Loom</h1>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">generative art</span>
        </header>

        <MoodBox ai={ai} tools={tools} />
        <Transport
          config={live}
          settings={state.settings}
          onLive={onLive}
          onSettings={onSettings}
          onCapture={() => void onCapture()}
          capturing={capturing}
          captureMsg={captureMsg}
        />
        <PaletteEditor palette={live.palette} onChange={(recipe) => onLive((d) => recipe(d.palette))} />
        <ControlPanel config={live} onLive={onLive} />
        <Gallery presets={state.presets} onSave={onSave} onLoad={onLoad} onDelete={onDelete} />
      </aside>
    </div>
  );
}

// Both exports are required for Module Federation lazy loading.
export default LoomApp;
