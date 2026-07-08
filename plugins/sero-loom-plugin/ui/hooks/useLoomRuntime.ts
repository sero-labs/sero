import { useEffect, useRef, useState } from 'react';

import type { BuildReport, LoomPiece } from '../../shared/types';
import { LoomRuntime } from '../runtime/LoomRuntime';

export interface RuntimeStatus {
  ready: boolean;
  error: string | null;
}

export interface UseLoomRuntimeResult extends RuntimeStatus {
  /** Offscreen wallpaper render at the given size → PNG data URL. */
  capture: (width: number, height: number) => string;
  /** Small frames for the agent's eyes → JPEG data URLs. */
  seeFrames: (width: number, frames: number, spacingSeconds: number) => string[];
}

interface Options {
  piece: LoomPiece;
  revision: number;
  speed: number;
  paused: boolean;
  transitionMs: number;
  /** Compile outcome for `revision` — written back to state as the BuildReport. */
  onBuild: (report: BuildReport) => void;
  /** A piece killed the GPU context twice; the runtime reverted to this piece. */
  onGpuHostileRevert: (piece: LoomPiece) => void;
}

export function useLoomRuntime(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLElement | null>,
  opts: Options,
): UseLoomRuntimeResult {
  const runtimeRef = useRef<LoomRuntime | null>(null);
  const [status, setStatus] = useState<RuntimeStatus>({ ready: false, error: null });

  // Latest callbacks without re-running effects.
  const cbRef = useRef({ onBuild: opts.onBuild, onGpuHostileRevert: opts.onGpuHostileRevert });
  cbRef.current = { onBuild: opts.onBuild, onGpuHostileRevert: opts.onGpuHostileRevert };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const runtime = new LoomRuntime(canvas, {
      onGpuHostileRevert: (piece) => cbRef.current.onGpuHostileRevert(piece),
    });
    try {
      runtime.init();
    } catch (err) {
      setStatus({ ready: false, error: err instanceof Error ? err.message : 'Failed to initialize WebGL2' });
      runtime.dispose();
      return;
    }
    runtimeRef.current = runtime;

    const sizeTo = () => {
      const rect = container.getBoundingClientRect();
      runtime.resize(rect.width, rect.height);
    };
    sizeTo();
    const ro = new ResizeObserver(sizeTo);
    ro.observe(container);
    setStatus({ ready: true, error: null });

    return () => {
      ro.disconnect();
      runtime.dispose();
      runtimeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the piece to the runtime on every change (param-value tweens included),
  // but only publish a BuildReport when the revision actually advances — a real
  // compose. Param-value tweens re-run this effect with the same revision and
  // must not rewrite the report, so they can't race the compose handshake or
  // spam redundant build writes.
  const lastBuiltRevision = useRef(-1);
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const result = runtime.setPiece(opts.piece);
    if (opts.revision === lastBuiltRevision.current && result.status === 'ok') return;
    lastBuiltRevision.current = opts.revision;
    if (result.status === 'error') {
      cbRef.current.onBuild({ revision: opts.revision, status: 'error', errors: result.errors });
      return;
    }
    // Report the successful build, then a settled fps reading shortly after so
    // the agent can reason about GPU cost.
    const report: BuildReport = { revision: opts.revision, status: 'ok', errors: [] };
    cbRef.current.onBuild(report);
    const timer = setTimeout(() => {
      const fps = Math.round(runtimeRef.current?.fps() ?? 0);
      if (fps > 0) cbRef.current.onBuild({ ...report, fps });
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.piece, opts.revision, status.ready]);

  useEffect(() => {
    runtimeRef.current?.setSpeed(opts.speed);
  }, [opts.speed]);
  useEffect(() => {
    runtimeRef.current?.setPaused(opts.paused);
  }, [opts.paused]);
  useEffect(() => {
    runtimeRef.current?.setTransitionMs(opts.transitionMs);
  }, [opts.transitionMs]);

  const capture = (width: number, height: number): string => {
    const runtime = runtimeRef.current;
    if (!runtime) throw new Error('Renderer not ready');
    return runtime.capture(width, height);
  };

  const seeFrames = (width: number, frames: number, spacingSeconds: number): string[] => {
    const runtime = runtimeRef.current;
    if (!runtime) throw new Error('Renderer not ready');
    return runtime.seeFrames(width, frames, spacingSeconds);
  };

  return { ...status, capture, seeFrames };
}
