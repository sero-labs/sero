import { useEffect, useRef, useState } from 'react';

import type { LoomConfig, RendererBackend } from '../../shared/types';
import { LoomEngine, type Backend } from '../engine/LoomEngine';

export interface EngineStatus {
  backend: Backend;
  ready: boolean;
  error: string | null;
}

export interface UseLoomEngineResult extends EngineStatus {
  /** Render one offscreen frame at the given size and return a PNG data URL. */
  capture: (width: number, height: number) => Promise<string>;
}

interface Options {
  config: LoomConfig;
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

  // Keep the latest config available to the init closure without re-mounting.
  const configRef = useRef(opts.config);
  configRef.current = opts.config;

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
      .init(configRef.current, opts.backend)
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

  // Sync config (smoothly morphs in the engine).
  useEffect(() => {
    engineRef.current?.setConfig(opts.config);
  }, [opts.config]);

  // Sync pause.
  useEffect(() => {
    engineRef.current?.setPaused(opts.paused);
  }, [opts.paused]);

  const capture = async (width: number, height: number): Promise<string> => {
    const engine = engineRef.current;
    if (!engine) throw new Error('Engine not ready');
    return engine.capture(width, height);
  };

  return { ...status, capture };
}
