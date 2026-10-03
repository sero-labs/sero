import { useEffect, useState } from 'react';
import type { SeroAdminBridge } from '@sero-ai/common';
import { FolderOpen } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, Switch, Textarea } from '@sero-ai/ui';

import type { ExecutionMode } from '../../shared/record';
import type { CreateProjectInput } from '../../shared/create-project';
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
  const [openSpecEnabled, setOpenSpecEnabled] = useState(false);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [name, setName] = useState('');
  const [location, setLocation] = useState(() => defaultFolder.replace(/\/+$/, ''));
  const folder = `${location}/${name.trim()}`;
  const [workspaces, setWorkspaces] = useState<IntakeWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [cap, setCap] = useState('5');
  const capUsd = Number(cap);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validName = name.trim().length > 0 && !/[\\/]/.test(name) && !['.', '..'].includes(name.trim());
  const chosen = workspaces.find((workspace) => workspace.id === workspaceId);

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

  // Each empty field is named when the user continues, so the button is never
  // disabled without a reason on screen.
  const problem = (): string | null => {
    if (!idea.trim()) return 'Tell Architect what you want.';
    if (mode === 'new' && !validName) return 'Enter a folder name.';
    if (mode === 'existing' && !chosen) return 'Choose a workspace.';
    if (!cap.trim() || !Number.isFinite(capUsd) || capUsd <= 0) return 'Enter a start cap.';
    return null;
  };

  const submit = async () => {
    if (busy) return;
    const missing = problem();
    if (missing) {
      setError(missing);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input: CreateProjectInput = {
        idea: idea.trim(),
        capUsd,
        executionMode,
        openSpecEnabled,
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
      <DialogContent className="p-0" style={{ maxWidth: 'min(760px, 92vw)' }}>
        <div className="ar-dialog ar-intake">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Say what you want and set a start cap. Sero then asks you to approve the access before paid work starts.
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
            <label htmlFor="ar-idea">What do you want?</label>
            <Textarea className="ar-intake-description" id="ar-idea" value={idea} onChange={(event) => setIdea(event.target.value)} disabled={busy} />
          </div>
          {mode === 'new' ? (
            <div className="ar-intake-row">
              <div className="ar-field">
                <label htmlFor="ar-name">Name</label>
                <Input id="ar-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="my-project" disabled={busy} />
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
                <SelectContent position="popper" align="start" className="ar-intake-workspace-menu">
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
          <div className="ar-field ar-intake-cap">
            <label htmlFor="ar-cap">Start cap ($)</label>
            <Input id="ar-cap" type="number" min="1" step="1" inputMode="decimal" value={cap} onChange={(event) => setCap(event.target.value)} disabled={busy} />
          </div>
          <label className="ar-intake-switch">
            <Switch checked={executionMode === 'worktree'} onCheckedChange={(on) => setExecutionMode(on ? 'worktree' : 'workspace')} disabled={busy || openSpecEnabled} />
            <span>Use worktree</span>
          </label>
          <label className="ar-intake-switch">
            <Switch checked={openSpecEnabled} onCheckedChange={(on) => { setOpenSpecEnabled(on); if (on) setExecutionMode('workspace'); }} disabled={busy} />
            <span>Use OpenSpec for coding changes</span>
          </label>
          {openSpecEnabled && <p className="ar-why">This proof of concept runs changes in the project workspace. You can request further changes after the first delivery.</p>}
          <IntakeModelOverrides choices={models} onChange={setModels} disabled={busy} />
          {error && <p role="alert" className="ar-error">{error}</p>}
          <div className="ar-foot">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Continue'}</Button>
          </div>
        </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
