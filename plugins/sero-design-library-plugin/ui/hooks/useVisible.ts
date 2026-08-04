import { useEffect, useRef, useState } from 'react';

/** Mount expensive card content only when it approaches the scroll viewport. */
export function useVisible<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  visible: boolean;
} {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '320px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}
