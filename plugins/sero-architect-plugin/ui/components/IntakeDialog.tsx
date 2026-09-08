import { useState } from 'react';
import type { SeroAdminBridge } from '@sero-ai/common';
import { FolderOpen } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Textarea } from '@sero-ai/ui';

import type { ActionOutcome } from '../lib/actions';

export interface IntakeDialogProps {
  open: boolean;
  onClose(): void;
  onCreate(idea: string, folder: string): Promise<ActionOutcome>;
  /** Fills the folder field with a sensible default under the home directory. */
  defaultFolder: string;
}

/** Intake asks for the idea and a folder, and nothing else. */
export function IntakeDialog({ open, onClose, onCreate, defaultFolder }: IntakeDialogProps) {
  const [idea, setIdea] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState(() => defaultFolder.replace(/\/+$/, ''));
  const folder = `${location}/${name.trim()}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validName = name.trim().length > 0 && !/[\\/]/.test(name) && !['.', '..'].includes(name.trim());
  const ready = idea.trim().length > 0 && validName && !busy;

  const pickLocation = async () => {
    setError(null);
    try {
      const sero = (window as Window & { sero?: Pick<SeroAdminBridge, 'workspace'> }).sero;
      if (!sero) throw new Error('Folder selection is available in the Sero desktop app.');
      const selected = await sero.workspace.pickFolder();
      if (selected) setLocation(selected.replace(/\/+$/, ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not select a folder.');
    }
  };

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await onCreate(idea.trim(), folder.trim());
      if (!outcome.ok) {
        setError(outcome.text);
        return;
      }
      // Success is navigated by the caller, which also closes this dialog. Closing here too
      // would push a second history entry and land on the list instead of the new project.
      setIdea('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the project.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="max-w-md" data-sero-plugin="architect">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Describe what you want to build and choose where to save it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-w-0 w-full flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]" htmlFor="ar-idea">Idea</label>
            <Textarea className="min-h-32 border-[var(--border-default)] bg-[var(--bg-surface)] text-sm" id="ar-idea" value={idea} onChange={(event) => setIdea(event.target.value)} disabled={busy} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]" htmlFor="ar-name">Name</label>
            <Input className="bg-[var(--bg-surface)] text-sm" id="ar-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="My Project" disabled={busy} required />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]" htmlFor="ar-location">Location</label>
            <Button id="ar-location" type="button" variant="outline" className="w-full justify-start bg-[var(--bg-surface)]" onClick={() => void pickLocation()} disabled={busy} title={location}>
              <FolderOpen className="size-4 shrink-0" />
              <span className="truncate">{location}</span>
            </Button>
          </div>
          {error && <p role="alert" className="text-xs text-status-error">{error}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={!ready}>{busy ? 'Creating…' : 'Create project'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
