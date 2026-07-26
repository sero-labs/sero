/**
 * The divider between the work you do constantly and the history you consult.
 *
 * Hand-rolled rather than using the host's resizable component: that pulls in a
 * second copy of a React-context library across module federation, which is the
 * class of problem that breaks plugin builds. Dragging is a pointer capture and
 * a percentage — nothing that needs a dependency.
 */

import { useCallback, useRef } from 'react';

interface Props {
  /** Current graph height as a percentage of the container. */
  heightPct: number;
  onChange: (pct: number) => void;
  onCommit: (pct: number) => void;
  min: number;
  max: number;
}

export function GraphDivider({ heightPct, onChange, onCommit, min, max }: Props) {
  const latestRef = useRef(heightPct);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const fromBottom = bounds.bottom - moveEvent.clientY;
      const pct = Math.min(max, Math.max(min, (fromBottom / bounds.height) * 100));
      latestRef.current = pct;
      onChange(pct);
    };

    const end = () => {
      target.releasePointerCapture(event.pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      onCommit(latestRef.current);
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
  }, [min, max, onChange, onCommit]);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize history"
      onPointerDown={handlePointerDown}
      className="group relative h-px shrink-0 cursor-row-resize bg-[var(--border-default)]"
    >
      {/* A 1px border is the visual; the grab area is deliberately taller. */}
      <div className="absolute inset-x-0 -top-1.5 h-4 group-hover:bg-[var(--brand-primary)]/10" />
    </div>
  );
}
