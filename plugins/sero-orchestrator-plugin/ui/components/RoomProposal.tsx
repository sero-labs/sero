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
import type { RoomProposalSummary } from '../../shared/room-blueprint-types';
import type { BlueprintClamp } from '../../shared/room-clamp';
import { accessTile } from '../lib/access-tile';
import { formatCost, formatDuration } from '../lib/format';
import { memberGlyph } from '../lib/member-glyph';
import { AuthorityBand, Eyebrow, Face, NoteBlock, Pill } from './room-kit';

interface RoomProposalProps {
  proposal: RoomProposalSummary;
  /** What the user's limits took away from the model's suggestion. */
  clamps: BlueprintClamp[];
  busy: boolean;
  onStart: () => void;
  onAdjust: (instruction: string) => void;
  onDiscard: () => void;
  /** Opens the read-only blueprint (screen 7). */
  onOpenAdvanced?: () => void;
}

/** `2 hours`, `45 minutes` — the consent tile writes the limit out in full. */
function workingTimeLabel(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} minutes`;
  if (mins % 60 === 0) return `${mins / 60} hour${mins === 60 ? '' : 's'}`;
  return formatDuration(ms);
}

/** The access warning: its lead sentence carries the weight (prototype `.warn b`). */
function WarnBlock({ text }: { text: string }) {
  const stop = text.indexOf('. ');
  const lead = stop >= 0 ? text.slice(0, stop + 1) : text;
  const rest = stop >= 0 ? text.slice(stop + 1) : '';
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-[9px] border border-status-warning-border bg-status-warning-muted px-3.5 py-3 text-xs leading-relaxed text-room-ink-warn">
      <span aria-hidden className="mt-px grid size-[17px] shrink-0 place-items-center rounded-full bg-status-warning-subtle text-[10px] text-status-warning">
        !
      </span>
      <span>
        <b className="font-semibold">{lead}</b>
        {rest}
      </span>
    </div>
  );
}

/** A dotted-underline disclosure link (prototype `.disclose a`). */
function DiscloseLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-b border-dotted border-room-line-strong pb-px text-[11px] text-room-text3 hover:text-room-text2"
    >
      {label}
    </button>
  );
}

export function RoomProposal({ proposal, clamps, busy, onStart, onAdjust, onDiscard, onOpenAdvanced }: RoomProposalProps) {
  const [adjusting, setAdjusting] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [instruction, setInstruction] = useState('');
  const working = proposal.teamSize - proposal.conductorCount;
  const access = accessTile(proposal.access);

  return (
    <div className="mx-auto mt-5 flex w-[min(848px,100%)] flex-col px-6 pb-8">
      <Eyebrow tone="brand">Proposed room</Eyebrow>
      <h2 className="mt-[9px] text-2xl font-semibold tracking-[-0.04em] text-room-text">{proposal.title}</h2>
      <p className="mt-2.5 text-sm leading-relaxed text-room-text2">{proposal.approach}</p>

      <section className="mt-[22px] overflow-hidden rounded-[10px] border border-room-line bg-room-surface">
        <div className="flex items-center border-b border-room-line px-[15px] py-[11px] text-xs font-medium text-room-text2">
          The team
          <span className="room-tabular ml-auto text-[10px] font-normal text-room-text3">
            {proposal.teamSize} members
          </span>
        </div>
        {proposal.roles.map((role) => (
          <div key={role.displayName} className="flex items-center gap-3 border-b border-room-line px-[15px] py-3 last:border-b-0">
            <Face
              size={30}
              tone={role.isConductor ? 'conductor' : 'member'}
              label={memberGlyph(role.displayName, role.isConductor)}
            />
            <span className="flex w-[190px] shrink-0 items-center gap-2 text-[13px] text-room-text @max-[700px]/panel:w-auto @max-[700px]/panel:min-w-0">
              <span className="truncate">{role.displayName}</span>
              {role.isConductor && <Pill tone="brand" className="h-[18px] shrink-0 text-[9px]">Leads</Pill>}
            </span>
            <span className="min-w-0 flex-1 text-xs leading-normal text-room-text3 @max-[700px]/panel:hidden">
              {role.responsibility}
            </span>
          </div>
        ))}
      </section>

      <div className="mt-4">
        <AuthorityBand
          title="✓ What you are approving"
          hint="computed from the plan the team will run under"
          cells={[
            { label: 'Team', value: `${proposal.teamSize} members`, sub: `${proposal.conductorCount} leads, ${working} work` },
            { label: 'Working time', value: `Up to ${workingTimeLabel(proposal.maxWallClockMs)}`, sub: 'then it pauses for you' },
            { label: 'Spend', value: `Up to ${formatCost(proposal.maxCostUsd)}`, sub: 'hard stop' },
            { label: 'Access', value: access.value, sub: access.sub },
          ]}
        />
      </div>

      {proposal.warnings.map((warning) => (
        <WarnBlock key={warning} text={warning} />
      ))}

      {clamps.length > 0 && (
        <NoteBlock tone="info" title={`Your limits changed ${clamps.length} thing${clamps.length === 1 ? '' : 's'}`} className="mt-3">
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {clamps.map((clamp, index) => (
              <li key={`${clamp.kind}-${index}`}>{clamp.detail}</li>
            ))}
          </ul>
        </NoteBlock>
      )}

      {adjusting ? (
        <section className="mt-[22px] flex flex-col gap-2 rounded-[10px] border border-room-line bg-room-surface p-3.5">
          <h3 className="text-xs font-medium text-room-text2">What should change?</h3>
          <p className="text-[11px] text-room-text4">
            Write it in your own words. Everything you set explicitly stays as it is.
          </p>
          <Textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={3}
            autoFocus
            className="border-room-line-strong bg-room-sunken text-[13px]"
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
        <div className="mt-[22px] flex flex-wrap items-center gap-2.5">
          <Button className="h-[38px] px-[18px] text-[13px]" disabled={busy} onClick={onStart}>
            Start room
          </Button>
          <Button variant="outline" className="h-[38px] px-[18px] text-[13px]" disabled={busy} onClick={() => setAdjusting(true)}>
            Adjust
          </Button>
          <Button variant="ghost" className="text-room-text3" disabled={busy} onClick={onDiscard}>
            Discard
          </Button>
          <span className="ml-auto flex items-center gap-4">
            <DiscloseLink label={showWhy ? 'Hide reasoning' : 'Why this team?'} onClick={() => setShowWhy((v) => !v)} />
            {onOpenAdvanced && <DiscloseLink label="Advanced settings" onClick={onOpenAdvanced} />}
          </span>
        </div>
      )}

      {showWhy && (
        <section className="mt-4 overflow-hidden rounded-[10px] border border-room-line bg-room-surface">
          <div className="flex items-center border-b border-room-line px-[15px] py-3 text-xs font-medium text-room-text2">
            Why this team?
            <span className="ml-auto"><Pill tone="collab">Planner reasoning</Pill></span>
          </div>
          <div className="p-[15px]">
            <p className="text-xs leading-[1.65] text-room-text3">{proposal.teamRationale}</p>
            <NoteBlock tone="collab" className="mt-3.5">
              This is the planner explaining its choices. It does not change what the team is allowed
              to do — the access, spend, time and team size you approve are computed from the plan
              itself, and this text cannot alter them.
            </NoteBlock>
          </div>
        </section>
      )}
    </div>
  );
}
