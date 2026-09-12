import { useCallback, useEffect, useState } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';

import {
  formatBytes,
  type ToolCaptureFile,
  type ToolCaptureView,
} from './tool-capture-details';

/**
 * Complete output for a bash result.
 *
 * The model-facing payload is a bounded preview only when the result carries
 * truncation metadata, so the note says which one the model received. Each
 * capture file opens here through a bounded, paged read; a file that is gone
 * reports that the complete output is unavailable instead of an empty view.
 */
export function ToolCaptureReport({ view }: { view: ToolCaptureView }) {
  const [selected, setSelected] = useState<ToolCaptureFile | null>(null);

  if (!view.capture.complete) {
    return (
      <div className="space-y-1">
        <SectionLabel />
        <p className="text-sm text-status-error">
          Complete output unavailable: {view.capture.unavailableReason ?? 'the capture could not be saved.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <SectionLabel />
        <p className="text-sm text-[var(--text-secondary)]">
          {view.preview
            ? 'The model received a bounded preview.'
            : 'The model received all of the output.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {view.files.map((file) => (
          <button
            key={file.kind}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setSelected(file);
            }}
            className="rounded border border-[var(--border-subtle)] px-2 py-1 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            {file.label} · {formatBytes(file.bytes)}
          </button>
        ))}
      </div>

      {selected ? (
        <ToolCaptureViewer key={selected.kind} file={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function SectionLabel() {
  return (
    <span className="text-sm uppercase tracking-wide text-[var(--text-muted)]">complete output</span>
  );
}

type ViewerState =
  | { kind: 'loading' }
  | { kind: 'open'; content: string; nextOffset?: number; totalBytes: number }
  | { kind: 'unavailable'; reason: string };

function ToolCaptureViewer({ file, onClose }: { file: ToolCaptureFile; onClose: () => void }) {
  const [state, setState] = useState<ViewerState>({ kind: 'loading' });

  const load = useCallback(async (offset: number | undefined) => {
    const readCapture = window.sero?.toolCapture?.readCapture;
    if (!readCapture) {
      setState({ kind: 'unavailable', reason: 'This window cannot read complete output.' });
      return;
    }
    try {
      const result = await readCapture({ path: file.hostPath, offset });
      if (result.state === 'unavailable') {
        setState({ kind: 'unavailable', reason: result.reason ?? 'The complete output is unavailable.' });
        return;
      }
      setState((previous) => ({
        kind: 'open',
        content: previous.kind === 'open' && offset !== undefined
          ? previous.content + result.content
          : result.content,
        nextOffset: result.nextOffset,
        totalBytes: result.totalBytes,
      }));
    } catch (error) {
      setState({
        kind: 'unavailable',
        reason: error instanceof Error ? error.message : 'The complete output could not be read.',
      });
    }
  }, [file.hostPath]);

  // The first slice is an external read, so it belongs in an effect. The parent
  // keys this component by file kind, so this runs once per opened file.
  useEffect(() => {
    void load(undefined);
  }, [load]);

  return (
    <div className="min-w-0 space-y-1">
      <ViewerHeader file={file} totalBytes={state.kind === 'open' ? state.totalBytes : undefined} onClose={onClose} />
      {state.kind === 'loading' ? <p className="text-sm text-[var(--text-muted)]">Loading…</p> : null}
      {state.kind === 'unavailable' ? (
        <p className="text-sm text-status-error">Complete output unavailable: {state.reason}</p>
      ) : null}
      {state.kind === 'open' ? <ViewerContent state={state} onLoadMore={load} /> : null}
    </div>
  );
}

function ViewerHeader({
  file,
  totalBytes,
  onClose,
}: {
  file: ToolCaptureFile;
  totalBytes?: number;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-[var(--text-muted)]">
        {file.label}
        {totalBytes === undefined ? ` · ${formatBytes(file.bytes)}` : ` · ${formatBytes(totalBytes)}`}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        Close
      </button>
    </div>
  );
}

function ViewerContent({
  state,
  onLoadMore,
}: {
  state: Extract<ViewerState, { kind: 'open' }>;
  onLoadMore: (offset: number | undefined) => Promise<void>;
}) {
  return (
    <>
      <pre
        className={cn(
          'max-h-80 overflow-auto whitespace-pre-wrap break-words rounded',
          'bg-[var(--surface-sunken)] p-2 font-mono text-sm leading-relaxed',
          'text-[var(--text-secondary)]',
        )}
      >
        {state.content}
      </pre>
      {state.nextOffset === undefined ? null : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onLoadMore(state.nextOffset);
          }}
          className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          Load more
        </button>
      )}
    </>
  );
}
