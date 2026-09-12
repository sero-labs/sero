import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui';
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
 *
 * The inline preview is capped: it exists for a quick look, not as the reading
 * surface. The complete file is one action away in a dedicated viewer, so the
 * tool call never accumulates an unbounded log.
 */

/** Stop appending to the inline preview at this many characters. */
const INLINE_PREVIEW_MAX_CHARS = 64 * 1024;

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
  | { kind: 'open'; content: string; nextOffset?: number; totalBytes: number; capped: boolean }
  | { kind: 'unavailable'; reason: string };

function ToolCaptureViewer({ file, onClose }: { file: ToolCaptureFile; onClose: () => void }) {
  const [state, setState] = useState<ViewerState>({ kind: 'loading' });
  const [fullViewerOpen, setFullViewerOpen] = useState(false);

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
      setState((previous) => {
        const accumulated = previous.kind === 'open' && offset !== undefined
          ? previous.content + result.content
          : result.content;
        const capped = accumulated.length >= INLINE_PREVIEW_MAX_CHARS;
        return {
          kind: 'open',
          content: capped ? accumulated.slice(0, INLINE_PREVIEW_MAX_CHARS) : accumulated,
          nextOffset: capped ? undefined : result.nextOffset,
          totalBytes: result.totalBytes,
          capped,
        };
      });
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
      {state.kind === 'open' ? (
        <ViewerContent
          state={state}
          onLoadMore={load}
          onOpenViewer={() => setFullViewerOpen(true)}
        />
      ) : null}
      {state.kind === 'open' && fullViewerOpen ? (
        <CaptureViewerDialog file={file} onClose={() => setFullViewerOpen(false)} />
      ) : null}
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
  onOpenViewer,
}: {
  state: Extract<ViewerState, { kind: 'open' }>;
  onLoadMore: (offset: number | undefined) => Promise<void>;
  onOpenViewer: () => void;
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
      <div className="flex items-center gap-3">
        {state.capped ? (
          <span className="text-sm text-[var(--text-muted)]">
            Preview capped at {formatBytes(INLINE_PREVIEW_MAX_CHARS)}. This is not the whole file.
          </span>
        ) : null}
        {!state.capped && state.nextOffset !== undefined ? (
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
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenViewer();
          }}
          className="text-sm text-[var(--text-link)] transition-colors hover:underline"
        >
          Open full output
        </button>
      </div>
    </>
  );
}

type SliceState =
  | { kind: 'loading' }
  | { kind: 'open'; content: string; totalBytes: number; nextOffset?: number }
  | { kind: 'unavailable'; reason: string };

/**
 * Where the shown slice sits in the file.
 *
 * A bare start offset reads as an empty view on a single-page file, so report
 * the shown range against the total. A whole-file read ends at its size.
 */
function positionLabel(
  offset: number,
  slice: { totalBytes: number; nextOffset?: number },
): string {
  if (slice.totalBytes === 0) return 'Empty file';
  const end = slice.nextOffset ?? slice.totalBytes;
  return `Bytes ${offset.toLocaleString()}–${end.toLocaleString()} of ${slice.totalBytes.toLocaleString()}`;
}

/** Navigation is offered only when the file has more than one slice. */
function canPage(history: readonly number[], slice: { nextOffset?: number }): boolean {
  return history.length > 0 || slice.nextOffset !== undefined;
}

/**
 * The dedicated reading surface for one complete capture.
 *
 * It shows one bounded slice at a time and offers paged navigation, so a
 * multi-megabyte capture opens without loading the whole file into the tool
 * call. It reads through the capture-root read contract, not the editor's
 * workspace path policy.
 */
function CaptureViewerDialog({ file, onClose }: { file: ToolCaptureFile; onClose: () => void }) {
  const [offset, setOffset] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [slice, setSlice] = useState<SliceState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const readCapture = window.sero?.toolCapture?.readCapture;
    if (!readCapture) {
      setSlice({ kind: 'unavailable', reason: 'This window cannot read complete output.' });
      return;
    }
    setSlice({ kind: 'loading' });
    void readCapture({ path: file.hostPath, offset }).then(
      (result) => {
        if (cancelled) return;
        if (result.state === 'unavailable') {
          setSlice({ kind: 'unavailable', reason: result.reason ?? 'The complete output is unavailable.' });
          return;
        }
        setSlice({
          kind: 'open',
          content: result.content,
          totalBytes: result.totalBytes,
          nextOffset: result.nextOffset,
        });
      },
      (error: unknown) => {
        if (cancelled) return;
        setSlice({
          kind: 'unavailable',
          reason: error instanceof Error ? error.message : 'The complete output could not be read.',
        });
      },
    );
    return () => { cancelled = true; };
  }, [file.hostPath, offset]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      {/*
       * A log viewer, not a prompt. Fill most of the window, pin the header and
       * footer, and let the content scroll on its own.
       */}
      <DialogContent className="flex h-[min(88vh,60rem)] w-[min(94vw,80rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 gap-1 border-b border-[var(--border-subtle)] px-5 py-3 pr-14">
          <DialogTitle>{file.label}</DialogTitle>
          <DialogDescription>
            Complete output · {formatBytes(slice.kind === 'open' ? slice.totalBytes : file.bytes)} · reads one page at a time
          </DialogDescription>
        </DialogHeader>

        {slice.kind === 'loading' ? (
          <p className="px-5 py-4 text-sm text-[var(--text-muted)]">Loading…</p>
        ) : null}
        {slice.kind === 'unavailable' ? (
          <p className="px-5 py-4 text-sm text-status-error">Complete output unavailable: {slice.reason}</p>
        ) : null}
        {slice.kind === 'open' ? (
          <>
            <pre
              className={cn(
                'min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words',
                'bg-[var(--surface-sunken)] px-5 py-4 font-mono text-sm leading-relaxed',
                'text-[var(--text-secondary)]',
              )}
            >
              {slice.content}
            </pre>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-5 py-3">
              <span className="text-sm text-[var(--text-muted)]">{positionLabel(offset, slice)}</span>
              {canPage(history, slice) ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={history.length === 0}
                    onClick={() => {
                      const previous = history[history.length - 1] ?? 0;
                      setHistory((current) => current.slice(0, -1));
                      setOffset(previous);
                    }}
                    className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={slice.nextOffset === undefined}
                    onClick={() => {
                      if (slice.nextOffset === undefined) return;
                      setHistory((current) => [...current, offset]);
                      setOffset(slice.nextOffset);
                    }}
                    className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
