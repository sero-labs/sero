import { useEffect, type RefObject } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';

/**
 * Syncs a resizable panel's collapsed/expanded state with a boolean `isOpen` flag
 * using requestAnimationFrame to let the panel settle before clearing the
 * programmatic-change guard.
 *
 * @param panelRef - Ref to the imperative panel handle
 * @param isProgrammaticRef - Ref that guards resize callbacks during programmatic changes
 * @param isOpen - Desired open state
 * @param targetPct - Percentage to resize to when expanding (optional)
 */
export function usePanelOpenSync(
  panelRef: RefObject<PanelImperativeHandle | null>,
  isProgrammaticRef: RefObject<boolean>,
  isOpen: boolean,
  targetPct?: number,
): void {
  useEffect(() => {
    let rafId: number | null = null;
    let rafId2: number | null = null;
    isProgrammaticRef.current = true;

    if (!isOpen) {
      panelRef.current?.collapse();
      rafId = window.requestAnimationFrame(() => {
        isProgrammaticRef.current = false;
      });
    } else {
      rafId = window.requestAnimationFrame(() => {
        panelRef.current?.expand();
        if (targetPct && targetPct > 0) {
          panelRef.current?.resize(`${targetPct}%`);
        }
        rafId2 = window.requestAnimationFrame(() => {
          isProgrammaticRef.current = false;
        });
      });
    }

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (rafId2 !== null) window.cancelAnimationFrame(rafId2);
      isProgrammaticRef.current = false;
    };
  }, [isOpen, panelRef, isProgrammaticRef, targetPct]);
}
