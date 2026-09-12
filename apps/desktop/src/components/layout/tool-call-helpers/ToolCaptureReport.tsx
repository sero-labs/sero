import { useEffect, useState } from 'react';
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
 * truncation metadata, so the note says which one the model received. Selecting
 * a capture file opens the viewer directly: there is no inline copy, so a tool
 * call never accumulates an unbounded log and the complete file stays one action
 * away. A file that is gone reports that the complete output is unavailable
 * instead of an empty view.
 */

export function ToolCaptureReport({ view }: { view: ToolCaptureView }) {
  const [selected, setSelected] = useState<ToolCaptureFile | null>(null);

  if (!view.capture.complete) {
    return (
      <p className="text-sm text-status-error">
        Complete output unavailable: {view.capture.unavailableReason ?? 'the capture could not be saved.'}
      </p>
    );
  }

  return (
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

      {selected ? (
        <CaptureViewerDialog
          key={selected.kind}
          file={selected}
          rewrite={view.rewrite}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
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
 * The reading surface for one complete capture.
 *
 * It shows one bounded slice at a time and offers paged navigation, so a
 * multi-megabyte capture opens without loading the whole file into the tool
 * call. It reads through the capture-root read contract, not the editor's
 * workspace path policy.
 */
function CaptureViewerDialog({
  file,
  rewrite,
  onClose,
}: {
  file: ToolCaptureFile;
  rewrite?: ToolCaptureView['rewrite'];
  onClose: () => void;
}) {
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
          <DialogTitle>Tool Details</DialogTitle>
          {/* Screen readers only: the payload above already shows a truncation marker. */}
          <DialogDescription className="sr-only">
            {file.label}: the complete captured output for this result. Reads one page at a time.
          </DialogDescription>
        </DialogHeader>

        {/* The executed command is here rather than in the transcript: the model
            asked for the requested command and cannot act on the wrapper. */}
        {rewrite ? (
          <dl className="shrink-0 space-y-1 border-b border-[var(--border-subtle)] px-5 py-3 text-sm">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-[var(--text-muted)]">Requested</dt>
              <dd className="min-w-0 break-all font-mono text-[var(--text-secondary)]">{rewrite.requested}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-[var(--text-muted)]">Executed</dt>
              <dd className="min-w-0 break-all font-mono text-[var(--text-secondary)]">{rewrite.executed}</dd>
            </div>
          </dl>
        ) : null}

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
