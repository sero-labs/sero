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
import { spendRatio, spendTone } from '@sero-ai/common';
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
    return (
      <div role="tabpanel" aria-label={MEMBER_TAB_LABEL.info} className="min-h-0 flex-1 overflow-y-auto p-[18px]">
        {/* What the member is, then the terms it runs on, then the spend — the
            order the drawing has. The tab used to open on an 81-word
            instruction, so the first thing read was how it works rather than
            what it is. */}
        <section className="flex flex-wrap items-stretch rounded-lg border border-room-line bg-room-surface">
          <div className="min-w-[16rem] flex-1 p-3.5">
            <dl>
              <Kv label="Model">{configuration.model} · {configuration.thinking}</Kv>
              <Kv label="Tools" mono>{configuration.tools.join(', ') || 'none'}</Kv>
              {/* "No worktree" is an access fact, not a card of its own: a
                  member that ran without one is otherwise indistinguishable
                  from one whose worktree is simply hidden. */}
              <Kv label="Access">{accessLine(member)}</Kv>
              {member.worktreePath && (
                <TooltipProvider delayDuration={500}>
                  <Kv label="Branch" mono><WorktreeValue value={member.worktreeBranch ?? '—'} /></Kv>
                  <Kv label="Path" mono><WorktreeValue value={member.worktreePath} openable /></Kv>
                </TooltipProvider>
              )}
              <Kv label="Role">{mandate.role}</Kv>
              <Kv label="Responsible for">{mandate.responsibilities}</Kv>
              {mandate.currentTask && <Kv label="Doing now">{mandate.currentTask}</Kv>}
              {mandate.priorities.length > 0 && <Kv label="Priorities">{mandate.priorities.join(' · ')}</Kv>}
            </dl>

            <MemberFold title="Working instructions">
              <p className="text-xs leading-relaxed text-room-text2">{mandate.workingInstructions}</p>
            </MemberFold>

            <MemberFold title="Usage">
              <dl>
                <Kv label="Turns">{usage.turns}</Kv>
                <Kv label="Input">{formatTokens(usage.inputTokens)} tokens</Kv>
                <Kv label="Output">{formatTokens(usage.outputTokens)} tokens</Kv>
                <Kv label="Cache read">{formatTokens(usage.cacheReadTokens)} tokens</Kv>
                <Kv label="Retries">{usage.retries}</Kv>
                <Kv label="Compactions">
                  {session.compactionCount}
                  {session.lastCompactedAt && ` · ${formatClock(session.lastCompactedAt)}`}
                </Kv>
                <Kv label="Skills" mono>{configuration.skills.join(', ') || 'none'}</Kv>
              </dl>
            </MemberFold>
          </div>

          {/* The spend ring is the shaded column beside the facts, with the
              hairline the drawing puts between them, and a member over its own
              limit reads as a fault by the SAME rule a project and a Room use. */}
          <div className="flex w-[240px] shrink-0 items-center justify-center border-l border-room-line bg-room-raised p-4">
            <SpendRing spentUsd={usage.costUsd} capUsd={maxCostUsd} />
          </div>
        </section>
      </div>
    );
  }

  return null;
}

/** Whether the member ran in its own checkout, as one of its access facts. */
function accessLine(member: RoomMember): string {
  // The record holds the permission id; the drawing reads it as a word.
  const permissions = member.configuration.permissions;
  const label = permissions.charAt(0).toUpperCase() + permissions.slice(1);
  return `${label} · ${member.worktreePath ? 'worktree' : 'no worktree'}`;
}

/** A fold inside the Info tab, with the drawing's chevron. */
function MemberFold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group mt-2 border-t border-room-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-xs text-room-text2 hover:text-room-text">
        <span aria-hidden className="text-room-text4 transition-transform group-open:rotate-90">›</span>
        {title}
      </summary>
      <div className="pb-2">{children}</div>
    </details>
  );
}

/**
 * The member's spend against its own limit.
 *
 * The tone comes from the one shared rule, so "over the limit" means the same
 * thing here as it does for the project and the Room. The amount is still shown
 * against the limit it passed, and the fault is stated in words: a reader who
 * cannot see the colour must not be the only one who misses it.
 */
function SpendRing({ spentUsd, capUsd }: { spentUsd: number; capUsd: number }) {
  const tone = spendTone(spentUsd, capUsd);
  const ratio = spendRatio(spentUsd, capUsd);
  const circumference = 2 * Math.PI * 26;
  const stroke = tone === 'err' ? 'var(--status-error)' : tone === 'warn' ? 'var(--status-warning)' : 'var(--brand-primary)';
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5" data-tone={tone}>
      <svg viewBox="0 0 64 64" className="size-16" aria-hidden="true">
        <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border-subtle)" strokeWidth="5" />
        <circle
          cx="32" cy="32" r="26" fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${(circumference * ratio).toFixed(1)} ${circumference.toFixed(1)}`}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <div className="text-center">
        <div className="room-tabular text-[13px] text-room-text">{formatCost(spentUsd)}</div>
        <div className="text-[11px] text-room-text4">spent of {formatCost(capUsd)} limit</div>
      </div>
      {tone === 'err' && (
        <div className="text-[11px] text-status-error">At or over the member limit</div>
      )}
    </div>
  );
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

/** A `.kv` row: a fixed label column, then the value beside it, wrapping rather than clipped. */
function Kv({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3.5 border-t border-room-line py-1.5 first:border-t-0">
      <dt className="pt-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-room-text3">{label}</dt>
      <dd className={cn('m-0 text-xs leading-[1.55]', mono ? 'break-words font-mono text-[10.5px] text-room-text2' : 'text-room-text2')}>
        {children}
      </dd>
    </div>
  );
}
