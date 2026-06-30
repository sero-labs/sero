import { useState } from 'react';
import { Button, Card, Input, Label, Switch, Textarea } from '@sero-ai/ui';
import { Loader2 } from 'lucide-react';

export interface CreateLoopSubmit {
  prompt: string;
  title?: string;
  useManagedWorktree: boolean;
  allowDirtyWorkspaceRoot: boolean;
}

interface CreateLoopFormProps {
  busy: boolean;
  onSubmit: (values: CreateLoopSubmit) => void;
  onCancel: () => void;
}

/**
 * D1 of the guided create flow (specs/09-ui-redesign.md): describe the task; the
 * AI writes the plan. Prompt leads; workspace safety is secondary. Activation is
 * no longer here — it's an explicit step once the plan is reviewed (D3).
 */
export function CreateLoopForm({ busy, onSubmit, onCancel }: CreateLoopFormProps) {
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [useManagedWorktree, setUseManagedWorktree] = useState(true);
  const [allowDirtyWorkspaceRoot, setAllowDirtyWorkspaceRoot] = useState(false);

  const submit = () => {
    if (!prompt.trim()) return;
    onSubmit({
      prompt: prompt.trim(),
      title: title.trim() || undefined,
      useManagedWorktree,
      allowDirtyWorkspaceRoot: useManagedWorktree ? false : allowDirtyWorkspaceRoot,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Describe what you want done</h2>
        <p className="text-sm text-muted-foreground">The AI writes the plan. Include any schedule.</p>
      </div>
      <Textarea
        autoFocus
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder='e.g. "Every 10 minutes, check GitHub issues and open a PR for anything unassigned."'
        rows={4}
        className="text-sm"
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="loop-title">Title (optional)</Label>
        <Input id="loop-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leave blank to let the AI name it" />
      </div>

      <Card className="flex flex-col gap-3 p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Safety</span>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="loop-worktree" className="font-normal">Run in a managed worktree (its own branch)</Label>
          <Switch id="loop-worktree" checked={useManagedWorktree} onCheckedChange={setUseManagedWorktree} />
        </div>
        {!useManagedWorktree && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="loop-allow-dirty" className="font-normal">Run here even with uncommitted changes</Label>
            <Switch id="loop-allow-dirty" checked={allowDirtyWorkspaceRoot} onCheckedChange={setAllowDirtyWorkspaceRoot} />
          </div>
        )}
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !prompt.trim()}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Generate plan →
        </Button>
      </div>
    </div>
  );
}
