import { useState } from 'react';
import type { SeroAdminBridge } from '@sero-ai/common';
import { FolderOpen } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Switch, Textarea } from '@sero-ai/ui';

import type { ExecutionMode } from '../../shared/record';
import type { ActionOutcome, ModelChoice } from '../lib/actions';
import { IntakeModelOverrides } from './IntakeModelOverrides';

export interface IntakeDialogProps {
  open: boolean;
  onClose(): void;
  onCreate(idea: string, folder: string, executionMode: ExecutionMode, models: ModelChoice[]): Promise<ActionOutcome>;
  /** Fills the folder field with a sensible default under the home directory. */
  defaultFolder: string;
}

/** Save the execution location before the owner starts discovery. */
export function IntakeDialog({ open, onClose, onCreate, defaultFolder }: IntakeDialogProps) {
  const [idea, setIdea] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('workspace');
  const [models, setModels] = useState<ModelChoice[]>([]);
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
      const outcome = await onCreate(idea.trim(), folder.trim(), executionMode, models);
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
      {/* The scope root itself is outside the plugin's @scope, so every class and
          token lives on the wrapper inside it. The width is inline for the same reason. */}
      <DialogContent data-sero-plugin="architect" className="p-0" style={{ maxWidth: 'min(760px, 92vw)' }}>
        <div className="ar-dialog ar-intake">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Describe what you want to build and choose where to save it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="ar-intake-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="ar-field">
            <label htmlFor="ar-idea">Description</label>
            <Textarea className="ar-intake-description" id="ar-idea" value={idea} onChange={(event) => setIdea(event.target.value)} disabled={busy} required />
          </div>
          <div className="ar-intake-row">
            <div className="ar-field">
              <label htmlFor="ar-name">Name</label>
              <Input id="ar-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="My Project" disabled={busy} required />
            </div>
            <div className="ar-field">
              <label htmlFor="ar-location">Location</label>
              <Button id="ar-location" type="button" variant="outline" className="ar-intake-location" onClick={() => void pickLocation()} disabled={busy} title={location}>
                <FolderOpen className="size-4 shrink-0" />
                <span className="truncate">{location}</span>
              </Button>
            </div>
          </div>
          <label className="ar-intake-switch">
            <Switch checked={executionMode === 'worktree'} onCheckedChange={(on) => setExecutionMode(on ? 'worktree' : 'workspace')} disabled={busy} />
            <span>Use worktree</span>
          </label>
          <IntakeModelOverrides choices={models} onChange={setModels} disabled={busy} />
          {error && <p role="alert" className="ar-error">{error}</p>}
          <div className="ar-foot">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={!ready}>{busy ? 'Creating…' : 'Create project'}</Button>
          </div>
        </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
