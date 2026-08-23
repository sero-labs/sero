import { useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Textarea } from '@sero-ai/ui/components/ui/textarea';
import { Sparkles, Wand2 } from 'lucide-react';

interface RefinePlanProps {
  busy: boolean;
  /**
   * The plan's revision number. A change means the request landed — it is the
   * only signal this component gets that the model wrote a new plan.
   */
  planRevision: number;
  /** Sends the refinement request to the coordinator's revise action. */
  onRefine: (prompt: string) => void;
}

/**
 * A request in flight. `sawBusy` exists because the parent turns `busy` on
 * asynchronously: without it the first render after submit, where `busy` is
 * still false, would be read as a request that had already finished.
 */
interface Pending {
  revisionAtSend: number;
  sawBusy: boolean;
}

/**
 * Free-text loop refinement. The instructions go to the model-driven `revise`
 * action, which can update the loop's goal (its stop condition or cadence) and
 * its steps; failures surface in the app's error banner. Keep this keyed by loop
 * id so switching loops clears the input.
 *
 * A revision can take a minute, and the plan above keeps showing the old steps
 * the whole time. With nothing but a disabled button to go on, two different
 * people read the screen as frozen and killed a run that was working — so the
 * request stays visible while it runs, and the outcome is stated when it lands.
 */
export function RefinePlan({ busy, planRevision, onRefine }: RefinePlanProps) {
  const [prompt, setPrompt] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [outcome, setOutcome] = useState<'updated' | 'unchanged' | null>(null);
  const trimmed = prompt.trim();

  // Resolved during render rather than in an effect: both signals are props, so
  // there is nothing to synchronise with the outside world.
  if (pending) {
    if (planRevision !== pending.revisionAtSend) {
      setPending(null);
      setOutcome('updated');
      setPrompt('');
    } else if (busy && !pending.sawBusy) {
      setPending({ ...pending, sawBusy: true });
    } else if (!busy && pending.sawBusy) {
      // The request ended and the plan is the same. The typed text is kept, so
      // a failed revision does not lose what was asked for.
      setPending(null);
      setOutcome('unchanged');
    }
  }

  const submit = () => {
    if (!trimmed) return;
    setOutcome(null);
    setPending({ revisionAtSend: planRevision, sawBusy: busy });
    onRefine(trimmed);
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={prompt}
        onChange={(e) => { setPrompt(e.target.value); setOutcome(null); }}
        placeholder="Update the plan — its stop condition (e.g. “stop when there are no unassigned issues left”), its schedule, or its steps."
        className="min-h-28"
        disabled={Boolean(pending)}
      />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={busy || Boolean(pending) || !trimmed} onClick={submit}>
          <Wand2 className="mr-1 h-3.5 w-3.5" /> Update plan
        </Button>
        {pending && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-sky-400" />
            The AI is rewriting the plan…
          </span>
        )}
        {!pending && outcome === 'updated' && (
          <span className="text-sm text-muted-foreground">Plan updated — read the steps above.</span>
        )}
        {!pending && outcome === 'unchanged' && (
          <span className="text-sm text-muted-foreground">
            The plan did not change. Try describing the change another way.
          </span>
        )}
      </div>
    </div>
  );
}
