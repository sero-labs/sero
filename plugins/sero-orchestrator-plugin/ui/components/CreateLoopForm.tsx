import { useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Label } from '@sero-ai/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sero-ai/ui/components/ui/select';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import { Textarea } from '@sero-ai/ui/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import type { DeliveryDestinationId, LoopDeliverySettings } from '../../shared/types';
import { LOOP_DELIVERY_DESTINATIONS, deliveryDestinationInfo, isLoopDeliveryDestinationId } from '../../shared/delivery-types';

export interface CreateLoopSubmit {
  prompt: string;
  title?: string;
  useManagedWorktree: boolean;
  allowDirtyWorkspaceRoot: boolean;
  /** 'event-pr' = the worktree checks out the PR branch named by the firing event. */
  worktreeBranchSource?: 'new' | 'event-pr';
  /** Absent = automatic (follows placement: worktree ⇒ PR, root ⇒ workspace files). */
  delivery?: LoopDeliverySettings;
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
  const [eventPrBranch, setEventPrBranch] = useState(false);
  const [destination, setDestination] = useState<DeliveryDestinationId | 'auto'>('auto');
  const [deliveryParams, setDeliveryParams] = useState<Record<string, string>>({});

  const paramHints = destination === 'auto' ? [] : deliveryDestinationInfo(destination).paramHints;

  const submit = () => {
    if (!prompt.trim()) return;
    const params = Object.fromEntries(
      paramHints.map((h) => [h.key, deliveryParams[h.key]?.trim()]).filter(([, v]) => v),
    ) as Record<string, string>;
    onSubmit({
      prompt: prompt.trim(),
      title: title.trim() || undefined,
      useManagedWorktree,
      allowDirtyWorkspaceRoot: useManagedWorktree ? false : allowDirtyWorkspaceRoot,
      worktreeBranchSource: useManagedWorktree && eventPrBranch ? 'event-pr' : undefined,
      delivery:
        destination === 'auto'
          ? undefined
          : { destination, params: Object.keys(params).length ? params : undefined },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Describe what you want done</h2>
        <p className="text-base text-muted-foreground">The AI writes the plan. Include any schedule.</p>
      </div>
      <Textarea
        autoFocus
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder='e.g. "Every 10 minutes, check GitHub issues and open a PR for anything unassigned."'
        rows={4}
        className="text-base"
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
        {useManagedWorktree && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="loop-event-pr" className="font-normal">Work on the PR branch from the firing event</Label>
            <Switch id="loop-event-pr" checked={eventPrBranch} onCheckedChange={setEventPrBranch} />
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="loop-delivery" className="font-normal">Deliver results to</Label>
          <Select
            value={destination}
            onValueChange={(value) => setDestination(isLoopDeliveryDestinationId(value) ? value : 'auto')}
          >
            <SelectTrigger id="loop-delivery" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatic</SelectItem>
              {LOOP_DELIVERY_DESTINATIONS.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {paramHints.map((h) => (
          <Input
            key={h.key}
            value={deliveryParams[h.key] ?? ''}
            placeholder={h.required ? `${h.placeholder} (required)` : h.placeholder}
            onChange={(e) => setDeliveryParams((p) => ({ ...p, [h.key]: e.target.value }))}
          />
        ))}
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
