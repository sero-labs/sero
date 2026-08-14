/**
 * The proposal — computed, not written (prototype screens 4, 5, 6).
 *
 * The four authority tiles are the consent surface, and every one of them is
 * computed by application code from the validated blueprint. The planner
 * supplies only the title, the one-sentence approach and the role one-liners;
 * nothing it writes carries authority. The warnings come from the fixed access
 * mapping, never from planner prose.
 *
 * Adjust never opens a form: the user writes what they want changed and the
 * whole proposal is recomputed from the revised plan.
 */

import { useState } from 'react';
import { Button, Textarea } from '@sero-ai/ui';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { RoomProposalSummary } from '../../shared/room-blueprint-types';
import type { BlueprintClamp } from '../../shared/room-clamp';
import { ROOM_ACCESS_LABEL_TEXT } from '../../shared/room-access-map';
import { formatCost, formatDuration } from '../lib/format';

interface RoomProposalProps {
  proposal: RoomProposalSummary;
  /** What the user's limits took away from the model's suggestion. */
  clamps: BlueprintClamp[];
  busy: boolean;
  onStart: () => void;
  onAdjust: (instruction: string) => void;
  onDiscard: () => void;
}

export function RoomProposal({ proposal, clamps, busy, onStart, onAdjust, onDiscard }: RoomProposalProps) {
  const [adjusting, setAdjusting] = useState(false);
  const [instruction, setInstruction] = useState('');
  const working = proposal.teamSize - proposal.conductorCount;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proposed room</p>
        <h2 className="mt-1 text-xl font-semibold">{proposal.title}</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">{proposal.approach}</p>
      </div>

      <section className="flex flex-col gap-1 rounded-lg border border-border p-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">The team</h3>
          <span className="text-xs text-muted-foreground">{proposal.teamSize} members</span>
        </div>
        {proposal.roles.map((role) => (
          <div key={role.displayName} className="flex items-baseline gap-3 py-1">
            <span className="w-40 shrink-0 truncate text-sm font-medium">
              {role.displayName}
              {role.isConductor && <span className="ml-1.5 text-xs font-normal text-muted-foreground">leads</span>}
            </span>
            <span className="min-w-0 flex-1 text-sm text-muted-foreground">{role.responsibility}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">What you are approving</h3>
          <span className="text-xs text-muted-foreground">computed from the plan the team runs under</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Team" value={`${proposal.teamSize} members`} note={`${proposal.conductorCount} leads, ${working} work`} />
          <Tile label="Working time" value={`Up to ${formatDuration(proposal.maxWallClockMs)}`} note="then it pauses for you" />
          <Tile label="Spend" value={`Up to ${formatCost(proposal.maxCostUsd)}`} note="hard stop" />
          <Tile
            label="Access"
            value={proposal.access.length === 0 ? 'Nothing outside the Room' : `${proposal.access.length} kind(s)`}
            note={proposal.access.map((entry) => ROOM_ACCESS_LABEL_TEXT[entry.label]).join(', ')}
          />
        </div>
      </section>

      {proposal.warnings.map((warning) => (
        <p key={warning} className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning}</span>
        </p>
      ))}

      {clamps.length > 0 && (
        <Disclosure title={`Your limits changed ${clamps.length} thing(s)`}>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {clamps.map((clamp, index) => (
              <li key={`${clamp.kind}-${index}`}>{clamp.detail}</li>
            ))}
          </ul>
        </Disclosure>
      )}

      {adjusting ? (
        <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold">What should change?</h3>
          <p className="text-xs text-muted-foreground">
            Write it in your own words. Everything you set explicitly stays as it is.
          </p>
          <Textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={3}
            autoFocus
            placeholder="Drop the second implementer and give the reviewer read access to GitHub."
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdjusting(false)} disabled={busy}>Cancel</Button>
            <Button disabled={busy || instruction.trim().length === 0} onClick={() => onAdjust(instruction.trim())}>
              {busy ? 'Rethinking…' : 'Rethink the team'}
            </Button>
          </div>
        </section>
      ) : (
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button disabled={busy} onClick={onStart}>Start room</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setAdjusting(true)}>Adjust</Button>
          <Button variant="ghost" className="ml-auto" disabled={busy} onClick={onDiscard}>Discard</Button>
        </div>
      )}

      <Disclosure title="Why this team?">
        <p className="max-w-prose text-sm text-muted-foreground">{proposal.teamRationale}</p>
      </Disclosure>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border p-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <b className="text-sm">{value}</b>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

/** Supporting detail, closed by default: it explains the proposal, it is not part of it. */
function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
      </button>
      {open && children}
    </div>
  );
}
