import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Ignore Monaco change events while an agent-owned buffer is visible.
 *
 * Monaco keeps its previous listener for the render that enables read-only
 * mode. Its controlled value update can call that stale listener, so the
 * callback must read the current streaming state from a ref.
 */
export function useStreamingEditorChange(
  isStreaming: boolean,
  onChange: (value: string | undefined) => void,
): (value: string | undefined) => void {
  const isStreamingRef = useRef(isStreaming);
  useLayoutEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  return useCallback((value: string | undefined) => {
    if (!isStreamingRef.current) onChange(value);
  }, [onChange]);
}
