import { useEffect, useRef, useState } from 'react';

/**
 * The rendered size of an element, kept current as it changes.
 *
 * A `ResizeObserver` is an external event source, so this is one of the places
 * an effect belongs. Nothing else can answer the question: the preview scales a
 * fixed-width page down to whatever room the pane happens to have, and that room
 * changes with the window, the sidebar and the surrounding layout.
 */
export function useElementSize<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  width: number;
  height: number;
} {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (box) setSize({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}
