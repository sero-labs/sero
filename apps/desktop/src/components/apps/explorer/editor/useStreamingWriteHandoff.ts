import { useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';

interface StreamingWriteHandoffOptions {
  workspaceId: string;
  editorPath: string | null;
  liveContent: string | null;
  dirty: boolean;
  contentMapRef: RefObject<Map<string, string>>;
  savedContentRef: RefObject<Map<string, string>>;
  setContent: Dispatch<SetStateAction<string>>;
}

interface HeldWrite {
  key: string;
  editorPath: string;
  content: string;
}

/**
 * Keep the final streamed frame read-only until the editor reads the file that
 * the tool wrote. The layout effect closes the one-render gap before paint, so
 * Monaco cannot expose the old file as an editable buffer.
 */
export function useStreamingWriteHandoff({
  workspaceId,
  editorPath,
  liveContent,
  dirty,
  contentMapRef,
  savedContentRef,
  setContent,
}: StreamingWriteHandoffOptions): string | null {
  const [heldWrite, setHeldWrite] = useState<HeldWrite | null>(null);
  const latestWriteRef = useRef<HeldWrite | null>(null);
  const key = editorPath ? `${workspaceId}\0${editorPath}` : null;

  useLayoutEffect(() => {
    if (!key || !editorPath || dirty) {
      latestWriteRef.current = null;
      setHeldWrite(null);
      return;
    }

    if (liveContent !== null) {
      latestWriteRef.current = { key, editorPath, content: liveContent };
      setHeldWrite(null);
      return;
    }

    const pending = latestWriteRef.current;
    if (!pending || pending.key !== key) {
      latestWriteRef.current = null;
      setHeldWrite(null);
      return;
    }

    let cancelled = false;
    setHeldWrite(pending);

    const release = () => {
      if (cancelled) return;
      if (latestWriteRef.current === pending) latestWriteRef.current = null;
      setHeldWrite((current) => (current?.key === pending.key ? null : current));
    };

    void window.sero.editor.readFile(workspaceId, editorPath).then(
      (fileContent) => {
        if (cancelled) return;
        contentMapRef.current.set(editorPath, fileContent);
        savedContentRef.current.set(editorPath, fileContent);
        setContent(fileContent);
        release();
      },
      release,
    );

    return () => {
      cancelled = true;
    };
  }, [contentMapRef, dirty, editorPath, key, liveContent, savedContentRef, setContent, workspaceId]);

  if (dirty) return null;
  if (liveContent !== null) return liveContent;
  return heldWrite?.key === key ? heldWrite.content : null;
}
