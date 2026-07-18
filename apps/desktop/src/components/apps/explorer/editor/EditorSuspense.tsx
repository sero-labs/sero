/**
 * EditorSuspense, shared boundary for lazily-loaded Monaco editors.
 *
 * Wraps a lazy Editor in a spinner fallback plus an error boundary
 * so a chunk-load failure or Monaco render error stays contained to the editor
 * pane (and auto-recovers stale chunks) instead of blanking the whole app.
 */

import { Suspense, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function EditorLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
    </div>
  );
}

export function EditorSuspense({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary region="Editor" compact>
      <Suspense fallback={<EditorLoading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}
