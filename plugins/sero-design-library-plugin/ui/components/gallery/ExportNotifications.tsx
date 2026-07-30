import { openSeroFile } from '@sero-ai/app-runtime';
import { Toaster } from '@sero-ai/ui';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import type { ExportSummary } from '../../../shared/export';
import { showItemInFolder } from '../../lib/host-files';

const TOASTER_ID = 'design-library-exports';

async function openExport(summary: ExportSummary, workspaceId: string): Promise<void> {
  if (!summary.path) return;
  if (summary.destination === 'downloads') {
    await showItemInFolder(summary.path);
    return;
  }
  const opened = await openSeroFile(workspaceId, `${summary.path.replace(/\/$/, '')}/index.html`);
  if (!opened) await showItemInFolder(summary.path);
}

export function notifyExport(summary: ExportSummary, workspaceId: string): void {
  const options = { id: summary.id, toasterId: TOASTER_ID };
  if (summary.status === 'running') {
    toast.loading('Exporting saved version…', options);
    return;
  }
  if (summary.status === 'failed') {
    toast.error(summary.error ?? 'Export failed.', options);
    return;
  }
  toast.success(
    `Exported to ${summary.destination === 'downloads' ? 'Downloads' : 'workspace'}`,
    {
      ...options,
      duration: 10_000,
      action: {
        label: summary.destination === 'downloads' ? 'Open folder' : 'Open in Explorer',
        onClick: () => void openExport(summary, workspaceId),
      },
    },
  );
}

export function ExportNotifications({
  summary,
  workspaceId,
}: {
  summary?: ExportSummary;
  workspaceId: string;
}) {
  const notified = useRef('');
  const signature = summary
    ? [summary.id, summary.status, summary.path, summary.error, workspaceId].join('\0')
    : '';
  useEffect(() => {
    if (!summary || notified.current === signature) return;
    notified.current = signature;
    notifyExport(summary, workspaceId);
  }, [signature, summary, workspaceId]);

  return <Toaster id={TOASTER_ID} position="top-right" visibleToasts={2} />;
}
