/**
 * Home / mission-control landing (specs/09-ui-redesign.md, A2 hybrid). Leads with
 * the cross-loop "Needs you" queue (questions + suggestions, resolved inline),
 * then the loops overview. Selecting a loop opens the list+detail working surface.
 */

import { Button } from '@sero-ai/ui';
import { Plus } from 'lucide-react';
import type { LoopSummary, OrchestratorAction } from '../../shared/types';
import { AttentionQueue } from './AttentionQueue';
import { LoopsOverview } from './LoopsOverview';

interface HomeViewProps {
  loops: LoopSummary[];
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
  onOpenLoop: (loopId: string) => void;
  onNew: () => void;
}

export function HomeView({ loops, busy, onAction, onOpenLoop, onNew }: HomeViewProps) {
  const questions = loops.reduce((n, l) => n + (l.attention?.input?.questions.length ?? 0), 0);
  const suggestions = loops.reduce((n, l) => n + (l.attention?.suggestions?.length ?? 0), 0);
  const needing = loops.filter((l) => l.attention?.input || l.attention?.suggestions?.length).length;
  const caughtUp = questions === 0 && suggestions === 0;

  return (
    <div className="flex h-full flex-1 flex-col gap-6 overflow-auto p-4">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Needs you</h2>
            <p className="text-xs text-muted-foreground">
              {caughtUp
                ? "You're all caught up."
                : `${questions} question${questions === 1 ? '' : 's'} · ${suggestions} suggestion${suggestions === 1 ? '' : 's'} across ${needing} loop${needing === 1 ? '' : 's'}`}
            </p>
          </div>
          <Button size="sm" onClick={onNew}><Plus className="mr-1 h-4 w-4" /> New loop</Button>
        </div>
        <AttentionQueue loops={loops} busy={busy} onAction={onAction} onOpenLoop={onOpenLoop} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Loops</h2>
        <LoopsOverview loops={loops} onOpenLoop={onOpenLoop} />
      </section>
    </div>
  );
}
