import { useEffect, useRef, useState } from 'react';

import type { LoomGraph, RendererBackend } from '../../shared/types';
import { LoomEngine, type Backend } from '../engine/LoomEngine';

export interface EngineStatus {
  backend: Backend;
  ready: boolean;
  error: string | null;
}

export interface UseLoomEngineResult extends EngineStatus {
  /** Render one offscreen frame at the given size and return a PNG data URL.
   *  `freeze` holds animation time for the captured frame. */
  capture: (width: number, height: number, freeze?: boolean) => Promise<string>;
}

interface Options {
  graph: LoomGraph;
  paused: boolean;
  backend: RendererBackend;
}

export function useLoomEngine(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLElement | null>,
  opts: Options,
): UseLoomEngineResult {
  const engineRef = useRef<LoomEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ backend: 'none', ready: false, error: null });

  // Keep the latest graph available to the init closure without re-mounting.
  const graphRef = useRef(opts.graph);
  graphRef.current = opts.graph;

  // Mount the engine once (re-mount only if the backend preference changes).
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let disposed = false;
    const engine = new LoomEngine(canvas);
    engineRef.current = engine;

    const sizeTo = () => {
      const rect = container.getBoundingClientRect();
      engine.resize(rect.width, rect.height);
    };

    engine
      .init(graphRef.current, opts.backend)
      .then((backend) => {
        if (disposed) {
          engine.dispose();
          return;
        }
        sizeTo();
        setStatus({ backend, ready: true, error: null });
      })
      .catch((err: unknown) => {
        setStatus({
          backend: 'none',
          ready: false,
          error: err instanceof Error ? err.message : 'Failed to initialize renderer',
        });
      });

    const ro = new ResizeObserver(sizeTo);
    ro.observe(container);

    return () => {
      disposed = true;
      ro.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.backend]);

  // Sync graph (smoothly morphs / rebuilds in the engine).
  useEffect(() => {
    engineRef.current?.setGraph(opts.graph);
  }, [opts.graph]);

  // Sync pause.
  useEffect(() => {
    engineRef.current?.setPaused(opts.paused);
  }, [opts.paused]);

  const capture = async (width: number, height: number, freeze = false): Promise<string> => {
    const engine = engineRef.current;
    if (!engine) throw new Error('Engine not ready');
    return engine.capture(width, height, freeze);
  };

  return { ...status, capture };
}
