/**
 * What a member IS, beside what it is saying (prototype screen 10, right side
 * and the Mandate / Info tabs).
 *
 * The split matters: a mandate is instructions and the user may see it change
 * freely, while a model, tool, skill or permission is authority and only ever
 * changes through a validated revision. The panel says so, because the two look
 * equally editable from outside and are not.
 */

import { cn } from '@sero-ai/ui/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import type { PersistentSessionContextUsage } from '@sero-ai/common';
import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { RoomMember } from '../../shared/room-types';
import { formatClock, formatCost, formatTokens } from '../lib/format';
import { canShowItemInFolder, showItemInFolder } from '../lib/host-files';
import { MEMBER_TAB_LABEL, type MemberTab } from '../lib/member-tabs';
import { ToolLiveCard } from './RoomMemberTranscript';
import { Eyebrow } from './room-kit';

interface FactsProps {
  member: RoomMember;
  live: MemberLiveSnapshot | null;
  context: PersistentSessionContextUsage | null;
  maxCostUsd: number;
}

/** The useful fallback when a completed member has no readable transcript. */
export function MemberCompletedOutcome({ member }: { member: RoomMember }) {
  return (
    <div role="tabpanel" aria-label={MEMBER_TAB_LABEL.session} className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-[18px]">
      <div className="min-w-0 w-full">
        <Eyebrow tone="brand">Outcome</Eyebrow>
        <p className="mt-3 max-w-5xl whitespace-pre-wrap break-words text-sm leading-relaxed text-room-text2">{member.statusDetail}</p>

        <section className="mt-6 min-w-0 overflow-hidden rounded-lg border border-room-line bg-room-surface p-3.5">
          <Eyebrow tone="brand">Session details</Eyebrow>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-room-line pt-3 sm:grid-cols-4">
            <CostStat label="Finished" value={formatClock(member.session.lastClosedAt ?? member.statusAt)} />
            <CostStat label="Turns" value={String(member.usage.turns)} />
            <CostStat label="Cost" value={formatCost(member.usage.costUsd)} />
            <CostStat label="Compactions" value={String(member.session.compactionCount)} />
          </div>
          {member.worktreePath && (
            <TooltipProvider delayDuration={500}>
              <div className="mt-3 min-w-0 border-t border-room-line pt-3">
                <p className="room-mono-micro uppercase tracking-[0.08em] text-room-text4">Worktree</p>
                <div className="room-tabular mt-1 min-w-0 max-w-full text-xs text-room-text3">
                  <WorktreeValue value={member.worktreePath} openable />
                </div>
              </div>
            </TooltipProvider>
          )}
        </section>
      </div>
    </div>
  );
}

/** The "doing right now" rail that sits beside the transcript (330px). */
export function MemberLiveRail({
  member,
  live,
  context,
  hasTranscript,
  className,
}: Omit<FactsProps, 'maxCostUsd'> & { hasTranscript: boolean; className?: string }) {
  const completed = member.status === 'completed';

  return (
    <aside className={cn('w-[330px] shrink-0 flex-col overflow-y-auto border-l border-room-line bg-room-sunken p-3.5', className)}>
      <Eyebrow tone="brand">{completed && hasTranscript ? 'Session details' : completed ? 'Outcome' : 'Doing right now'}</Eyebrow>
      {completed ? (
        !hasTranscript && <p className="mt-[9px] text-[11px] leading-[1.55] text-room-text3">{member.statusDetail}</p>
      ) : live?.toolInFlight ? (
        <ToolLiveCard tool={live.toolInFlight} className="mt-[9px]" />
      ) : (
        <p className="mt-[9px] text-[11px] text-room-text4">{member.statusDetail}</p>
      )}
      {!completed && (
        <p className="mt-[9px] text-[10px] leading-[1.55] text-room-text4">
          Streamed from the session itself as it happens — the same output the member is producing, not a summary
          of it.
        </p>
      )}

      {(!completed || !hasTranscript) && <div aria-hidden className="my-3.5 h-px bg-room-line" />}

      {!completed && <ContextMeter context={context} member={member} />}

      <div className="mt-[11px]">
        {completed && <Kv label="Finished">{formatClock(member.session.lastClosedAt ?? member.statusAt)}</Kv>}
        <Kv label="Compactions">
          {member.session.compactionCount}
          {member.session.lastCompactedAt && ` · ${formatClock(member.session.lastCompactedAt)}`}
        </Kv>
        {!completed && member.session.sessionPath && <Kv label="Session file" mono>{member.session.sessionPath}</Kv>}
        {member.worktreePath && <Kv label="Worktree" mono>{member.worktreeBranch ?? member.worktreePath}</Kv>}
        <Kv label="Turns">{member.usage.turns}</Kv>
        <Kv label="Cost">{formatCost(member.usage.costUsd)}</Kv>
      </div>

    </aside>
  );
}

/** The detail behind one tab. `session` has no panel — the transcript IS that tab. */
export function MemberTabPanel({ tab, member, context, maxCostUsd }: FactsProps & { tab: MemberTab }) {
  const { mandate, configuration, session, usage } = member;

  if (tab === 'info') {
    const costPercent = maxCostUsd > 0 ? Math.min(100, (usage.costUsd / maxCostUsd) * 100) : 0;

    return (
      <div role="tabpanel" aria-label={MEMBER_TAB_LABEL.info} className="min-h-0 flex-1 overflow-y-auto p-[18px]">
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <section className="rounded-lg border border-room-line bg-room-surface p-3.5 sm:col-span-2">
            <Eyebrow tone="brand">Mandate</Eyebrow>
            <div className="mt-2">
              <MandateRow label="Role">{mandate.role}</MandateRow>
              <MandateRow label="Responsibilities">{mandate.responsibilities}</MandateRow>
              {mandate.currentTask && <MandateRow label="Doing now">{mandate.currentTask}</MandateRow>}
              {mandate.priorities.length > 0 && (
                <MandateRow label="Priorities">{mandate.priorities.join(' · ')}</MandateRow>
              )}
              <MandateRow label="Working instructions">{mandate.workingInstructions}</MandateRow>
            </div>
          </section>

          <section className="rounded-lg border border-room-line bg-room-surface p-3.5">
            <ContextMeter context={context} member={member} brand />
            <div className="mt-2">
              <Kv label="Compactions">
                {session.compactionCount}
                {session.lastCompactedAt && ` · ${formatClock(session.lastCompactedAt)}`}
              </Kv>
              <Kv label="Model">{configuration.model} · {configuration.thinking}</Kv>
              <Kv label="Tools" mono>{configuration.tools.join(', ') || 'none'}</Kv>
              <Kv label="Skills" mono>{configuration.skills.join(', ') || 'none'}</Kv>
              <Kv label="Access">{configuration.permissions}</Kv>
            </div>
          </section>

          <section className="rounded-lg border border-room-line bg-room-surface p-3.5">
            <Eyebrow tone="brand">Worktree</Eyebrow>
            {member.worktreePath ? (
              <TooltipProvider delayDuration={500}>
                <div className="mt-2">
                  <Kv label="Branch" mono>
                    <WorktreeValue value={member.worktreeBranch ?? '—'} />
                  </Kv>
                  <Kv label="Path" mono>
                    <WorktreeValue value={member.worktreePath} openable />
                  </Kv>
                </div>
              </TooltipProvider>
            ) : (
              <p className="mt-2 text-xs text-room-text4">No worktree</p>
            )}
          </section>

          <section className="rounded-lg border border-room-line bg-room-surface p-3.5 sm:col-span-2">
            <Eyebrow tone="brand">Cost</Eyebrow>
            <div className="mt-2 flex items-baseline gap-2">
              <b className="text-lg font-semibold text-room-text">{formatCost(usage.costUsd)}</b>
              <span className="room-tabular text-xs text-room-text4">of {formatCost(maxCostUsd)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-room-muted">
              <div className="h-full bg-brand-primary" style={{ width: `${costPercent}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-room-line pt-3 sm:grid-cols-5">
              <CostStat label="Turns" value={String(usage.turns)} />
              <CostStat label="Input" value={formatTokens(usage.inputTokens)} />
              <CostStat label="Output" value={formatTokens(usage.outputTokens)} />
              <CostStat label="Cache read" value={formatTokens(usage.cacheReadTokens)} />
              <CostStat label="Retries" value={String(usage.retries)} />
            </div>
          </section>
        </div>
      </div>
    );
  }

  return null;
}

function WorktreeValue({ value, openable = false }: { value: string; openable?: boolean }) {
  const canOpen = openable && canShowItemInFolder();
  const valueNode = canOpen ? (
    <button
      type="button"
      className="block w-full max-w-full truncate text-left underline decoration-room-text4 underline-offset-2 hover:text-room-text"
      onClick={() => void showItemInFolder(value)}
    >
      {value}
    </button>
  ) : (
    <span className="block w-full max-w-full truncate">{value}</span>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{valueNode}</TooltipTrigger>
      <TooltipContent className="max-w-[min(36rem,calc(100vw-2rem))] break-all text-left" sideOffset={6}>
        {value}
      </TooltipContent>
    </Tooltip>
  );
}

function MandateRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-room-line py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <p className="room-mono-micro uppercase tracking-[0.08em] text-room-text4">{label}</p>
      <p className="text-xs leading-relaxed text-room-text2">{children}</p>
    </div>
  );
}

function CostStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="room-mono-micro uppercase tracking-[0.08em] text-room-text4">{label}</p>
      <p className="room-tabular mt-1 text-xs text-room-text2">{value}</p>
    </div>
  );
}

/** The 6px context track with its legend (prototype `.ctx-meter`). */
function ContextMeter({
  context,
  member,
  brand = false,
}: {
  context: PersistentSessionContextUsage | null;
  member: RoomMember;
  brand?: boolean;
}) {
  if (!context) {
    return (
      <div>
        <Eyebrow tone={brand ? 'brand' : 'neutral'}>Context</Eyebrow>
        <p className="mt-1.5 text-[10px] leading-[1.55] text-room-text4">
          {member.session.sessionId
            ? 'The session is closed, so it holds no context window. Its history is still readable.'
            : 'This member has not started a session yet.'}
        </p>
      </div>
    );
  }
  const pct = Math.min(100, (context.usedTokens / context.maxTokens) * 100);
  return (
    <div>
      <Eyebrow tone={brand ? 'brand' : 'neutral'}>Context</Eyebrow>
      <span className="mt-[9px] block h-1.5 w-full overflow-hidden rounded-[3px] bg-room-muted">
        <span
          className={cn('block h-full', pct >= 80 ? 'bg-status-warning' : 'bg-brand-primary')}
          style={{ width: `${pct}%` }}
        />
      </span>
      <p className="room-mono-micro mt-[7px] text-room-text4">
        {formatTokens(context.usedTokens)} of {formatTokens(context.maxTokens)} used
      </p>
    </div>
  );
}

/** A `.kv` row: label left, value right, hairline above. */
function Kv({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-room-line py-2 text-[11px]">
      <small className="mr-auto shrink-0 text-[11px] text-room-text4">{label}</small>
      <span className={cn('min-w-0 truncate text-right', mono ? 'room-tabular text-[10px] text-room-text3' : 'font-medium text-room-text2')}>
        {children}
      </span>
    </div>
  );
}
