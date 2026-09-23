import { useEffect, useState } from 'react';
import type { SeroAdminBridge } from '@sero-ai/common';
import { FolderOpen } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, Switch, Textarea } from '@sero-ai/ui';

import type { CreateProjectInput, ExecutionMode } from '../../shared/record';
import type { ActionOutcome, ModelChoice } from '../lib/actions';
import { IntakeModelOverrides } from './IntakeModelOverrides';

/** The two places a project can start. */
type IntakeMode = 'new' | 'existing';

/** The fields the picker reads from the host bridge. */
interface IntakeWorkspace {
  id: string;
  name: string;
  path: string;
}

export interface IntakeDialogProps {
  open: boolean;
  onClose(): void;
  onCreate(input: CreateProjectInput): Promise<ActionOutcome>;
  /** Fills the folder field with a sensible default under the home directory. */
  defaultFolder: string;
  /** Workspace ids that already hold an Architect project; they cannot be chosen. */
  takenWorkspaceIds: string[];
  /** Opening choice. The app always starts on New folder; the preview harness picks the other. */
  initialMode?: IntakeMode;
}

/** The default Sero workspace. It holds personal data, so it is never offered. */
const GLOBAL_WORKSPACE_ID = 'global';

/** Save the execution location before the owner starts discovery. */
export function IntakeDialog({ open, onClose, onCreate, defaultFolder, takenWorkspaceIds, initialMode = 'new' }: IntakeDialogProps) {
  const [idea, setIdea] = useState('');
  const [mode, setMode] = useState<IntakeMode>(initialMode);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('workspace');
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [name, setName] = useState('');
  const [location, setLocation] = useState(() => defaultFolder.replace(/\/+$/, ''));
  const folder = `${location}/${name.trim()}`;
  const [workspaces, setWorkspaces] = useState<IntakeWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validName = name.trim().length > 0 && !/[\\/]/.test(name) && !['.', '..'].includes(name.trim());
  const chosen = workspaces.find((workspace) => workspace.id === workspaceId);
  const ready = idea.trim().length > 0 && !busy && (mode === 'existing' ? Boolean(chosen) : validName);

  // The picker reads the profile's workspaces through the host bridge, the same
  // seam `pickFolder` uses. A list that cannot be read leaves Existing workspace
  // empty, so New folder still works.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const sero = (window as Window & { sero?: Pick<SeroAdminBridge, 'workspace'> }).sero;
    void Promise.resolve(sero?.workspace.list?.())
      .then((list) => {
        if (!cancelled) setWorkspaces((list ?? []).map((workspace) => ({ id: workspace.id, name: workspace.name, path: workspace.path })));
      })
      .catch(() => { if (!cancelled) setWorkspaces([]); });
    return () => { cancelled = true; };
  }, [open]);

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
      const input: CreateProjectInput = {
        idea: idea.trim(),
        executionMode,
        models,
        ...(mode === 'existing' ? { workspaceId } : { folder: folder.trim() }),
      };
      const outcome = await onCreate(input);
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

  const taken = new Set(takenWorkspaceIds);
  const free = workspaces.filter((workspace) => workspace.id !== GLOBAL_WORKSPACE_ID && !taken.has(workspace.id));
  const used = workspaces.filter((workspace) => workspace.id !== GLOBAL_WORKSPACE_ID && taken.has(workspace.id));

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
          <div className="ar-intake-choice" role="group" aria-label="Where will it work?">
            <button type="button" className="ar-intake-choice-option" aria-pressed={mode === 'new'} onClick={() => setMode('new')} disabled={busy}>New folder</button>
            <button type="button" className="ar-intake-choice-option" aria-pressed={mode === 'existing'} onClick={() => setMode('existing')} disabled={busy}>Existing workspace</button>
          </div>
          <div className="ar-field">
            <label htmlFor="ar-idea">Description</label>
            <Textarea className="ar-intake-description" id="ar-idea" value={idea} onChange={(event) => setIdea(event.target.value)} disabled={busy} required />
          </div>
          {mode === 'new' ? (
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
          ) : (
            <div className="ar-field">
              <label htmlFor="ar-workspace">Workspace</label>
              <Select value={workspaceId} onValueChange={setWorkspaceId} disabled={busy}>
                <SelectTrigger id="ar-workspace" aria-label="Workspace" className="ar-intake-workspace">
                  <FolderOpen className="size-4 shrink-0" />
                  <span className="ar-workspace-name">{chosen?.name ?? 'Choose a workspace'}</span>
                  {chosen && <span className="ar-workspace-path">{chosen.path}</span>}
                </SelectTrigger>
                <SelectContent className="ar-intake-workspace-menu">
                  {free.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id} textValue={workspace.name}>
                      <span className="ar-workspace-name">{workspace.name}</span>
                      <span className="ar-workspace-path">{workspace.path}</span>
                    </SelectItem>
                  ))}
                  {used.map((workspace, index) => (
                    <SelectItem key={workspace.id} value={workspace.id} textValue={workspace.name} disabled className={index === 0 ? 'ar-workspace-group-start' : undefined}>
                      <span className="ar-workspace-name">{workspace.name}</span>
                      <span className="ar-workspace-taken">Architect project</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
