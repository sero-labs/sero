import { useState } from 'react';
import { Button, Card, Input, Label, Switch, Textarea } from '@sero-ai/ui';
import { Loader2 } from 'lucide-react';

export interface CreateLoopSubmit {
  prompt: string;
  title?: string;
  useManagedWorktree: boolean;
  activate: boolean;
}

interface CreateLoopFormProps {
  busy: boolean;
  onSubmit: (values: CreateLoopSubmit) => void;
  onCancel: () => void;
}

export function CreateLoopForm({ busy, onSubmit, onCancel }: CreateLoopFormProps) {
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [useManagedWorktree, setUseManagedWorktree] = useState(true);
  const [activate, setActivate] = useState(false);

  const submit = () => {
    if (!prompt.trim()) return;
    onSubmit({ prompt: prompt.trim(), title: title.trim() || undefined, useManagedWorktree, activate });
  };

  return (
    <div className="flex h-full flex-1 flex-col gap-4 overflow-auto p-4">
      <h1 className="text-lg font-semibold">New loop</h1>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="loop-title">Title (optional)</Label>
          <Input id="loop-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leave blank to let the model name it" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="loop-prompt">What should this loop do?</Label>
          <Textarea
            id="loop-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the work. The model turns this into a step plan."
            rows={5}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="loop-worktree">Run in a managed worktree</Label>
          <Switch id="loop-worktree" checked={useManagedWorktree} onCheckedChange={setUseManagedWorktree} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="loop-activate">Activate after creating</Label>
          <Switch id="loop-activate" checked={activate} onCheckedChange={setActivate} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !prompt.trim()}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Create loop
          </Button>
        </div>
      </Card>
    </div>
  );
}
