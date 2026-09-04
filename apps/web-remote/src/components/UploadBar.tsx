/**
 * Upload bar — put a file into the workspace, from the Files panel.
 *
 * The button opens the phone's own picker, which is where a camera roll
 * or a downloaded PDF lives. Dropping a file on the panel does the same
 * thing on a desktop browser.
 */

import { useRef } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { useUploadsStore } from '@/stores/uploads';

export function UploadBar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = useUploadsStore((s) => s.uploading);
  const queued = useUploadsStore((s) => s.queued);
  const recent = useUploadsStore((s) => s.recent);
  const error = useUploadsStore((s) => s.error);
  const upload = useUploadsStore((s) => s.upload);
  const mention = useUploadsStore((s) => s.mention);

  const lastUpload = recent[0];

  return (
    <div className="shrink-0 border-t border-[var(--border-subtle)] px-2 py-1.5">
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        data-testid="upload-input"
        aria-hidden="true"
        onChange={(event) => {
          void upload([...(event.target.files ?? [])]);
          // Clearing lets the same file be picked twice in a row.
          event.target.value = '';
        }}
      />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="h-6 px-2 text-xs"
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          Upload
        </Button>

        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">
          {uploading && queued.length > 0
            ? `${queued.length} to go…`
            : `Files land in ${'uploads/'}`}
        </span>
      </div>

      {lastUpload && !uploading && (
        <p className="flex items-center gap-2 pt-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]" title={lastUpload.path}>
            {lastUpload.path}
            {lastUpload.renamed && (
              <span className="text-[var(--text-muted)]"> · renamed, the name was taken</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => mention(lastUpload.path)}
            className="shrink-0 text-[var(--brand-primary)] hover:underline"
          >
            Mention in prompt
          </button>
        </p>
      )}

      {error && <p className="pt-1.5 text-xs text-status-error">{error}</p>}
    </div>
  );
}
