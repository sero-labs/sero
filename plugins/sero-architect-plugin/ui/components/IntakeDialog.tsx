import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@sero-ai/ui';

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
  const [folder, setFolder] = useState(defaultFolder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = idea.trim().length > 0 && folder.trim().length > 0 && !busy;

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
      setIdea('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="ar-dialog" data-sero-plugin="architect">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Give the Architect the idea and a folder. It creates the folder, runs git init, registers the workspace and then asks for the session grant.
          </DialogDescription>
        </DialogHeader>
        <form
          className="ar-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="ar-field">
            <label htmlFor="ar-idea">Idea</label>
            <textarea id="ar-idea" value={idea} onChange={(event) => setIdea(event.target.value)} required />
            <small>Kept verbatim on the record.</small>
          </div>
          <div className="ar-field">
            <label htmlFor="ar-folder">Folder</label>
            <input id="ar-folder" value={folder} onChange={(event) => setFolder(event.target.value)} required />
            <small>Must be inside your home directory. An empty or new folder.</small>
          </div>
          {error && <p className="ar-error">{error}</p>}
          <div className="ar-foot">
            <Button type="button" variant="outline" size="sm" className="ar-btn" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" size="sm" className="ar-btn ar-btn-solid" disabled={!ready}>{busy ? 'Creating…' : 'Create project'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
