/**
 * ConnectExistingView — paste a git remote URL and (optionally) import its files.
 *
 * Empty workspaces import automatically. When the workspace already has files,
 * import is skipped and the user is shown an honest choice: overlay the repo
 * anyway (git refuses to overwrite conflicting files) or just record the remote.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Label } from '@sero-ai/ui/components/ui/label';
import type { WorkspaceInfo } from '@/types/ipc';
import { connectOrigin, describeImportOutcome } from '../git-remote/workflow';
import { BackButton, ErrorBanner } from './remote-origin-views';

type Phase =
  | { kind: 'input' }
  | { kind: 'busy'; label: string }
  // Remote is linked, but files were not imported — let the user decide what to do.
  | { kind: 'reconcile'; message: string };

export function ConnectExistingView({
  workspace,
  onBack,
  onConnected,
}: {
  workspace: WorkspaceInfo;
  onBack: () => void;
  onConnected: (url: string, warning?: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'input' });
  const [error, setError] = useState<string | null>(null);

  const trimmedUrl = url.trim();
  const busy = phase.kind === 'busy';

  const run = async (importMode: 'auto' | 'force') => {
    if (!trimmedUrl || busy) return;
    setError(null);
    setPhase({ kind: 'busy', label: importMode === 'force' ? 'Importing…' : 'Connecting…' });

    const result = await connectOrigin({ workspaceId: workspace.id, url: trimmedUrl, importMode });
    if (!result.ok) {
      setError(result.message);
      setPhase({ kind: 'input' });
      return;
    }

    if (result.import.imported) {
      onConnected(result.url);
      return;
    }

    // Not imported: surface why and let the user pick a next step.
    setPhase({
      kind: 'reconcile',
      message: describeImportOutcome(result.import) ?? 'Remote linked. Nothing was imported.',
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && phase.kind === 'input' && trimmedUrl) {
      e.preventDefault();
      void run('auto');
    }
  };

  if (phase.kind === 'reconcile') {
    return (
      <div className="flex flex-col gap-4 pt-1">
        <BackButton onClick={onBack} />
        <p className="rounded-md bg-status-warning-muted p-2 text-xs text-status-warning">{phase.message}</p>
        <p className="text-xs text-[var(--text-muted)]">
          Import will overlay the repository onto this workspace. Files already in the workspace are kept;
          Sero won't overwrite anything that clashes with the repository.
        </p>
        {error && <ErrorBanner message={error} />}
        <div className="flex justify-between gap-2 pt-1">
          <Button variant="ghost" onClick={() => onConnected(trimmedUrl, phase.message)}>
            Just link
          </Button>
          <Button onClick={() => { void run('force'); }}>Import anyway</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-1" onKeyDown={handleKeyDown}>
      <BackButton onClick={onBack} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="remote-url" className="text-base font-medium text-[var(--text-secondary)]">
          Remote URL
        </Label>
        <Input
          id="remote-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/user/repo.git"
          disabled={busy}
        />
        <span className="text-xs text-[var(--text-muted)]">
          An empty workspace is filled with the repository's files automatically.
        </span>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onBack} disabled={busy}>Cancel</Button>
        <Button onClick={() => { void run('auto'); }} disabled={busy || !trimmedUrl}>
          {busy ? (
            <><Loader2 className="mr-1.5 size-3.5 animate-spin" />{phase.label}</>
          ) : (
            'Connect Repository'
          )}
        </Button>
      </div>
    </div>
  );
}
