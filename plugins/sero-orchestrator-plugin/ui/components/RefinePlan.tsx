import { useState } from 'react';
import { Button, Textarea } from '@sero-ai/ui';
import { Wand2 } from 'lucide-react';

interface RefinePlanProps {
  busy: boolean;
  /** Sends the refinement request to the coordinator's revise action. */
  onRefine: (prompt: string) => void;
}

/**
 * Free-text loop refinement. The instructions go to the model-driven `revise`
 * action, which can update the loop's goal (its stop condition or cadence) and
 * its steps; failures surface in the app's error banner. Keep this keyed by loop
 * id so switching loops clears the input.
 */
export function RefinePlan({ busy, onRefine }: RefinePlanProps) {
  const [prompt, setPrompt] = useState('');
  const trimmed = prompt.trim();

  const submit = () => {
    if (!trimmed) return;
    onRefine(trimmed);
    setPrompt('');
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Refine this loop — its stop condition (e.g. “stop when there are no unassigned issues left”), its schedule, or its steps."
        rows={2}
        disabled={busy}
      />
      <Button size="sm" variant="outline" className="self-start" disabled={busy || !trimmed} onClick={submit}>
        <Wand2 className="mr-1 h-3.5 w-3.5" /> Refine loop
      </Button>
    </div>
  );
}
