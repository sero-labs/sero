import { useCallback, useMemo, useRef, useState } from 'react';
import { useAI, useAppState, useAppTools } from '@sero-ai/app-runtime';

import {
  DEFAULT_LOOM_STATE,
  normalizeGraph,
  normalizeLoomState,
  structuredCloneState,
  type CaptureResolution,
  type LoomGraph,
  type LoomState,
} from '../shared/types';
import { DirectionBox } from './components/DirectionBox';
import { Gallery } from './components/Gallery';
import { GraphEditor } from './components/GraphEditor';
import { LayerList } from './components/LayerList';
import { TalkBox } from './components/TalkBox';
import { Transport } from './components/Transport';
import { useLoomEngine } from './hooks/useLoomEngine';
import { captureDims, setDirection, setGraph, updateGraph, updateSettings } from './lib/loom-ui';
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

  // Referentially stable graph so the engine only re-syncs on real change.
  const graphKey = JSON.stringify(state.graph);
  const graph = useMemo(() => state.graph, [graphKey]);

  const { backend, ready, error, capture } = useLoomEngine(canvasRef, containerRef, {
    graph,
    paused: state.settings.paused,
    backend: state.settings.rendererBackend,
  });

  const [capturing, setCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState('');

  const mutate = useCallback((recipe: (g: LoomGraph) => void) => updateGraph(updateState, recipe), [updateState]);

  const onSave = useCallback((name: string) => {
    updateState((prev) => {
      const s = normalizeLoomState(prev);
      const id = `piece-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
      return { ...s, presets: [...s.presets, { id, name, createdAt: Date.now(), graph: structuredCloneState(s.graph) }] };
    });
  }, [updateState]);

  const onLoad = useCallback((id: string) => {
    updateState((prev) => {
      const s = normalizeLoomState(prev);
      const p = s.presets.find((x) => x.id === id);
      return p ? { ...s, graph: normalizeGraph(p.graph) } : s;
    });
  }, [updateState]);

  const onDelete = useCallback((id: string) => {
    updateState((prev) => {
      const s = normalizeLoomState(prev);
      return { ...s, presets: s.presets.filter((x) => x.id !== id) };
    });
  }, [updateState]);

  const onCapture = useCallback(async () => {
    if (capturing || !ready) return;
    setCapturing(true);
    setCaptureMsg('Rendering…');
    const dims = captureDims(state.settings);
    try {
      const dataUrl = await capture(dims.w, dims.h, state.settings.capture.freezeOnCapture);
      try {
        const res = await tools.run('loom_capture', {
          dataUrl, width: dims.w, height: dims.h, name: 'loom',
          writeSidecar: state.settings.capture.writeSidecarConfig,
        });
        setCaptureMsg(res.text || `Saved ${dims.w}×${dims.h}`);
      } catch {
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
      <div ref={containerRef} className="relative min-w-0 flex-1">
        <canvas ref={canvasRef} className="block size-full" />
        {(!ready || error) && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <div className="max-w-sm rounded-lg border border-border bg-background/80 p-4 backdrop-blur">
              {error ? (
                <>
                  <p className="text-sm font-medium text-destructive">Renderer unavailable</p>
                  <p className="mt-1 text-xs text-muted-foreground">WebGPU and WebGL could not initialize. {error}</p>
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

      <aside className="flex w-[330px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-background p-4">
        <header className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Loom</h1>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">generative art</span>
        </header>

        <TalkBox ai={ai} tools={tools} />
        <DirectionBox value={state.direction.guidance} onCommit={(g) => setDirection(updateState, g)} />
        <Transport
          speed={state.graph.speed}
          paused={state.settings.paused}
          captureResolution={state.settings.capture.resolution}
          onSpeed={(v) => mutate((g) => { g.speed = v; })}
          onTogglePause={() => updateSettings(updateState, (s) => { s.paused = !s.paused; })}
          onCaptureResolution={(r: CaptureResolution) => updateSettings(updateState, (s) => { s.capture.resolution = r; })}
          onCapture={() => void onCapture()}
          capturing={capturing}
          captureMsg={captureMsg}
        />
        <LayerList graph={graph} mutate={mutate} />
        <GraphEditor graph={graph} onApply={(g) => setGraph(updateState, g)} />
        <Gallery presets={state.presets} onSave={onSave} onLoad={onLoad} onDelete={onDelete} />
      </aside>
    </div>
  );
}

export default LoomApp;
