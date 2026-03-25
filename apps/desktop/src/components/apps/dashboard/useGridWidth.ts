/**
 * useGridWidth — tracks the container width for react-grid-layout.
 *
 * react-grid-layout requires an explicit pixel width. This hook
 * uses ResizeObserver to track the container's width reactively.
 */

import { useRef, useState, useCallback, useLayoutEffect } from 'react';

export function useGridWidth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const measure = useCallback(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.clientWidth);
    }
  }, []);

  // ResizeObserver subscription — acceptable useEffect for external DOM source
  useLayoutEffect(() => {
    measure();

    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  return { containerRef, width };
}
