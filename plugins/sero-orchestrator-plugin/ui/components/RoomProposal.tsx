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
import { formatCost } from '../lib/format';
import { memberGlyph } from '../lib/member-glyph';
import { proposalDiff, workingTimeLabel } from '../lib/proposal-diff';
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
  /**
   * The proposal as it stood before the last adjustment — the snapshot the
   * recompute diff is measured against (screen 5). Null until one lands.
   */
  previous?: RoomProposalSummary | null;
  /** The instruction that produced the revision, kept visible in the panel. */
  initialInstruction?: string;
  /** Leaves the revised view for the full proposal. */
  onDismissRevision?: () => void;
}

/** The prototype's five suggestion chips — seeds for the instruction, nothing more. */
const ADJUST_SUGGESTIONS = [
  'Use fewer agents',
  'Add a security reviewer',
  'Keep the cost below $2',
  'No deployment tools',
  'Make them challenge each other',
];

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

export function RoomProposal({
  proposal,
  clamps,
  busy,
  onStart,
  onAdjust,
  onDiscard,
  onOpenAdvanced,
  previous = null,
  initialInstruction = '',
  onDismissRevision,
}: RoomProposalProps) {
  const revised = previous != null;
  const [adjusting, setAdjusting] = useState(revised);
  const [showWhy, setShowWhy] = useState(false);
  const [instruction, setInstruction] = useState(initialInstruction);
  // An instruction typed but not recomputed: Start must not launch the OLD
  // proposal while the user believes their change applies (the consent
  // surface is only ever the computed summary on screen).
  const pendingAdjust = adjusting && instruction.trim() !== initialInstruction.trim();
  const working = proposal.teamSize - proposal.conductorCount;
  const access = accessTile(proposal.access);
  const diff = previous ? proposalDiff(previous, proposal) : null;

  const closeAdjust = () => {
    setAdjusting(false);
    onDismissRevision?.();
  };

  return (
    <div className="mx-auto mt-5 flex w-[min(848px,100%)] flex-col px-6 pb-8">
      <Eyebrow tone="brand">Proposed room{revised && ' · revised'}</Eyebrow>
      <h2 className="mt-[9px] text-2xl font-semibold tracking-[-0.04em] text-room-text">{proposal.title}</h2>
      {!revised && <p className="mt-2.5 text-sm leading-relaxed text-room-text2">{proposal.approach}</p>}

      {adjusting && (
        <section className="mt-4 overflow-hidden rounded-[10px] border border-status-info-border bg-linear-[160deg] from-status-info-faint to-transparent">
          <div className="flex items-center gap-2 border-b border-status-info-subtle px-[15px] py-[11px] text-[11px] font-medium text-room-ink-info">
            ✎ Tell Sero what to change
          </div>
          <div className="p-[15px] pt-3.5">
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              rows={2}
              autoFocus={!revised}
              className="min-h-[56px] border-room-line-strong bg-room-sunken px-[13px] py-3 text-[13px] leading-relaxed text-room-text2"
              placeholder="Use one implementer instead of two, keep the cost under $2, and don't let anything push to GitHub."
            />
            <div className="mt-[11px] flex flex-wrap gap-1.5">
              {ADJUST_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInstruction((current) => (current.trim() ? `${current.trim()} ${suggestion}.` : `${suggestion}.`))}
                  className="h-[26px] rounded-[13px] border border-room-line bg-room-raised px-2.5 text-[11px] text-room-text3 hover:text-room-text2"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" className="text-room-text3" onClick={closeAdjust} disabled={busy}>
                Cancel
              </Button>
              <Button disabled={busy || instruction.trim().length === 0} onClick={() => onAdjust(instruction.trim())}>
                {busy ? 'Rethinking…' : 'Rethink the team'}
              </Button>
            </div>
          </div>
        </section>
      )}

      {diff && (
        <div className="mt-3.5">
          <AuthorityBand
            tone="neutral"
            title={<><span className="text-brand-primary">✓</span> Recomputed from the revised plan</>}
            cells={[
              { label: 'Team', value: diff.team.value, was: diff.team.was },
              { label: 'Working time', value: diff.time.value, was: diff.time.was },
              { label: 'Spend', value: diff.spend.value, was: diff.spend.was },
              { label: 'Access', value: diff.access.value, was: diff.access.was },
            ]}
            footer={
              <>
                {diff.kept.length > 0 && (
                  <><b className="font-medium text-room-text3">Kept as you set them:</b> {diff.kept.join(', ')}. </>
                )}
                {diff.removed.length > 0 && (
                  <><b className="font-medium text-room-text3">Removed:</b> {diff.removed.join(', ')}. </>
                )}
                {diff.added.length > 0 && (
                  <><b className="font-medium text-room-text3">Added:</b> {diff.added.join(', ')}.</>
                )}
              </>
            }
          />
        </div>
      )}

      {!revised && (
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
      )}

      {!revised && (
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
      )}

      {!revised && proposal.warnings.map((warning) => (
        <WarnBlock key={warning} text={warning} />
      ))}

      {clamps.length > 0 && (
        <NoteBlock tone="info" title={`Your limits changed ${clamps.length} thing${clamps.length === 1 ? '' : 's'}`} className="mt-3">
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {clamps.map((clamp) => (
              <li key={`${clamp.kind}-${clamp.detail}`}>{clamp.detail}</li>
            ))}
          </ul>
        </NoteBlock>
      )}

      <div className="mt-[22px] flex flex-wrap items-center gap-2.5">
        <Button
          className="h-[38px] px-[18px] text-[13px]"
          disabled={busy || pendingAdjust}
          title={pendingAdjust ? 'Rethink the team first — the change you typed has not been applied' : undefined}
          onClick={onStart}
        >
          Start room
        </Button>
        {!adjusting && (
          <Button variant="outline" className="h-[38px] px-[18px] text-[13px]" disabled={busy} onClick={() => setAdjusting(true)}>
            Adjust
          </Button>
        )}
        <Button variant="ghost" className="text-room-text3" disabled={busy} onClick={onDiscard}>
          Discard
        </Button>
        <span className="ml-auto flex items-center gap-4">
          {revised && onDismissRevision && <DiscloseLink label="Full proposal" onClick={closeAdjust} />}
          <DiscloseLink label={showWhy ? 'Hide reasoning' : 'Why this team?'} onClick={() => setShowWhy((v) => !v)} />
          {onOpenAdvanced && <DiscloseLink label="Advanced settings" onClick={onOpenAdvanced} />}
        </span>
      </div>

      {showWhy && (
        <section className="mt-4 overflow-hidden rounded-[10px] border border-room-line bg-room-surface">
          <div className="flex items-center border-b border-room-line px-[15px] py-3 text-xs font-medium text-room-text2">
            Why this team?
            <span className="ml-auto"><Pill tone="collab">Planner reasoning</Pill></span>
          </div>
          <div className="p-[15px]">
            <p className="text-xs leading-[1.65] text-room-text3">{proposal.teamRationale}</p>
            <div className="mt-3.5 grid gap-[9px]">
              {proposal.roles.map((role) => (
                <div key={role.displayName} className="flex gap-[11px] rounded-lg border border-room-line bg-room-sunken px-3 py-[11px]">
                  <Face
                    size={26}
                    tone={role.isConductor ? 'conductor' : 'member'}
                    label={memberGlyph(role.displayName, role.isConductor)}
                  />
                  <div className="min-w-0">
                    <b className="block text-[11px] font-medium text-room-text2">{role.displayName}</b>
                    <span className="mt-[5px] block text-[11px] leading-relaxed text-room-text4">
                      {role.rationale ?? role.responsibility}
                    </span>
                  </div>
                </div>
              ))}
            </div>
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
