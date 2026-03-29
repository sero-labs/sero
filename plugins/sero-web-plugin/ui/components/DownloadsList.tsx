import { useCallback } from 'react';
import { useAppInfo, useAppState } from '@sero-ai/app-runtime';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  LoaderCircle,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import type { WebAccessState, WebDownload } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';
import { relativeTime, truncate } from '../lib/format';
import { isVisibleDownload } from '../lib/downloads';
import { deleteWorkspaceFile, openWorkspaceFile, revealInFinder } from '../lib/host';

export function DownloadsList() {
  const { workspaceId } = useAppInfo();
  const [state, updateState] = useAppState<WebAccessState>(DEFAULT_STATE);
  const downloads = [...(state.downloads ?? [])]
    .filter(isVisibleDownload)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const removeEntry = useCallback((downloadId: string) => {
    updateState((prev) => ({
      ...prev,
      downloads: (prev.downloads ?? []).filter((entry) => entry.id !== downloadId),
      lastSyncedAt: Date.now(),
    }));
  }, [updateState]);

  const deleteDownload = useCallback(async (download: WebDownload) => {
    if (download.relativePath && download.status === 'completed') {
      const deleted = await deleteWorkspaceFile(workspaceId, download.relativePath);
      if (!deleted) return;
    }
    removeEntry(download.id);
  }, [removeEntry, workspaceId]);

  if (downloads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-16">
        <Download className="mb-2 h-5 w-5 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No downloads yet</p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Saved PDFs and other extracted files will appear here
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col">
        {downloads.map((download) => (
          <DownloadRow
            key={download.id}
            download={download}
            workspaceId={workspaceId}
            onDelete={() => deleteDownload(download)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

interface DownloadRowProps {
  download: WebDownload;
  workspaceId: string;
  onDelete: () => void;
}

function DownloadRow({ download, workspaceId, onDelete }: DownloadRowProps) {
  const openDownload = useCallback(async () => {
    if (!download.relativePath) return;
    await openWorkspaceFile(workspaceId, download.relativePath);
  }, [download.relativePath, workspaceId]);

  const revealDownload = useCallback(async () => {
    if (!download.absolutePath) return;
    await revealInFinder(download.absolutePath);
  }, [download.absolutePath]);

  const isActive = download.status === 'queued' || download.status === 'downloading';
  const isCompleted = download.status === 'completed';
  const progressPct = typeof download.progressPct === 'number'
    ? Math.max(0, Math.min(100, download.progressPct))
    : null;
  const showProgress = isActive && progressPct !== null;
  const displayPath = download.relativePath || download.absolutePath;

  return (
    <div className="animate-web-fade-in border-b border-border px-3 py-3 last:border-b-0 hover:bg-secondary/30">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">{statusIcon(download.status)}</div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {truncate(download.title || download.sourceUrl, 80)}
              </p>
              <a
                href={download.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-blue-400/70 transition-colors hover:text-blue-400"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                <span className="truncate">{truncate(download.sourceUrl, 90)}</span>
              </a>
            </div>

            <StatusBadge download={download} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/70">
            {!isCompleted && <span>{download.phase}</span>}
            <span>Updated {relativeTime(download.updatedAt)}</span>
            {download.speedText && <span>{download.speedText}</span>}
            {download.etaText && download.status === 'downloading' && <span>ETA {download.etaText}</span>}
            {download.sizeText && <span>{download.sizeText}</span>}
          </div>

          {showProgress && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground/60">
                {progressPct.toFixed(progressPct >= 10 ? 0 : 1)}%
              </div>
            </div>
          )}

          {displayPath && (
            <div className="mt-2 break-all font-mono text-[11px] text-muted-foreground/75">
              {displayPath}
            </div>
          )}

          {download.error && (
            <p className="mt-2 text-[11px] leading-relaxed text-destructive">
              {download.error}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              disabled={!download.relativePath || download.status !== 'completed'}
              onClick={() => { void openDownload(); }}
            >
              <FolderOpen className="h-3 w-3" />
              Open in editor
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              disabled={!download.absolutePath}
              onClick={() => { void revealDownload(); }}
            >
              <ExternalLink className="h-3 w-3" />
              Reveal in Finder
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[11px] text-muted-foreground hover:text-destructive"
              disabled={isActive}
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function statusIcon(status: WebDownload['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case 'downloading':
    case 'queued':
      return <LoaderCircle className="h-4 w-4 animate-spin text-primary" />;
    default:
      return <Download className="h-4 w-4 text-muted-foreground" />;
  }
}

function StatusBadge({ download }: { download: WebDownload }) {
  const label = download.status === 'completed'
    ? 'done'
    : download.status === 'error'
      ? 'error'
      : download.status === 'queued'
        ? 'queued'
        : 'downloading';

  const className = download.status === 'completed'
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
    : download.status === 'error'
      ? 'border-destructive/20 bg-destructive/10 text-destructive'
      : 'border-primary/20 bg-primary/10 text-primary';

  return (
    <Badge variant="outline" className={`shrink-0 px-1.5 py-0 text-[10px] leading-4 ${className}`}>
      {label}
    </Badge>
  );
}

export default DownloadsList;
