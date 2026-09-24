import { ChevronRight, ChevronsLeft } from 'lucide-react';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sero-ai/ui';
import type { ProjectRun } from '../../shared/record';
import { runLabel } from '../lib/inspector-view';
import { LIFETIME } from '../lib/use-inspector-trace';
import { StateIcon } from './InspectorStatus';

/** Project, the page title, Scope and Live: the only controls above the figures. */
export function InspectorHeader({ name, runs, scope, onScope, live, onLive, onBack }: {
  name: string;
  runs: readonly ProjectRun[];
  scope: string;
  onScope(scope: string): void;
  /** Null when the selected scope cannot change: a closed run or the lifetime view. */
  live: boolean | null;
  onLive(): void;
  onBack(): void;
}) {
  return (
    <div className="ar-insp-top">
      <Button variant="outline" size="sm" className="ar-btn" onClick={onBack}><ChevronsLeft aria-hidden="true" />Project</Button>
      <div className="ar-insp-crumb"><ChevronRight aria-hidden="true" /><span>Run metrics · {name}</span></div>
      <div className="ar-insp-actions">
        <label className="ar-insp-scope">
          <span>Scope</span>
          <Select value={scope} onValueChange={onScope}>
            <SelectTrigger size="sm" aria-label="Scope" className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={LIFETIME}>Project lifetime</SelectItem>
              {[...runs].reverse().map((run) => (
                <SelectItem key={run.id} value={run.id}>{runLabel(run)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {live !== null && (
          <Button variant="outline" size="sm" className="ar-btn" aria-pressed={live} onClick={onLive}>
            <StateIcon state={live ? 'running' : 'waiting'} />{live ? 'Live' : 'Paused'}
          </Button>
        )}
      </div>
    </div>
  );
}
