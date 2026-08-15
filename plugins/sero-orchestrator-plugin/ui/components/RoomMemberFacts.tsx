/**
 * What a member IS, beside what it is saying (prototype screen 10, right side
 * and the Mandate / Context / Worktree / Cost tabs).
 *
 * The split matters: a mandate is instructions and the user may see it change
 * freely, while a model, tool, skill or permission is authority and only ever
 * changes through a validated revision. The panel says so, because the two look
 * equally editable from outside and are not.
 */

import { cn } from '@sero-ai/ui/lib/utils';
import type { PersistentSessionContextUsage } from '@sero-ai/common';
import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { RoomMember } from '../../shared/room-types';
import { formatClock, formatCost, formatRelative, formatTokens } from '../lib/format';
import { ToolLiveCard } from './RoomMemberTranscript';
import { Eyebrow } from './room-kit';

export type MemberTab = 'session' | 'mandate' | 'context' | 'worktree' | 'cost';

export const MEMBER_TAB_LABEL: Record<MemberTab, string> = {
  session: 'Session',
  mandate: 'Mandate',
  context: 'Context',
  worktree: 'Worktree',
  cost: 'Cost',
};

interface FactsProps {
  member: RoomMember;
  live: MemberLiveSnapshot | null;
  context: PersistentSessionContextUsage | null;
  maxCostUsd: number;
}

/** The useful fallback when a completed member has no readable transcript. */
export function MemberCompletedOutcome({ member }: { member: RoomMember }) {
  return (
    <div role="tabpanel" aria-label={MEMBER_TAB_LABEL.session} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
      <div className="max-w-4xl">
        <Eyebrow tone="brand">Outcome</Eyebrow>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-room-text2">{member.statusDetail}</p>

        <div className="mt-6 grid border-t border-room-line sm:grid-cols-2">
          <OutcomeFact label="Finished" value={formatClock(member.session.lastClosedAt ?? member.statusAt)} />
          <OutcomeFact label="Turns" value={String(member.usage.turns)} />
          <OutcomeFact label="Cost" value={formatCost(member.usage.costUsd)} />
          <OutcomeFact label="Compactions" value={String(member.session.compactionCount)} />
          {member.worktreePath && (
            <OutcomeFact label="Worktree" value={member.worktreeBranch ?? member.worktreePath} mono />
          )}
        </div>
      </div>
    </div>
  );
}

function OutcomeFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 border-b border-room-line py-2.5 sm:odd:pr-6 sm:even:pl-6">
      <span className="text-xs uppercase tracking-[0.12em] text-room-text4">{label}</span>
      <p className={cn('mt-1 break-words text-xs text-room-text2', mono && 'room-mono')}>{value}</p>
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

  if (tab === 'mandate') {
    return (
      <TabPanel tab={tab}>
        <Fact label="Role" value={mandate.role} />
        <Fact label="Responsibilities" value={mandate.responsibilities} />
        <Fact label="Doing now" value={mandate.currentTask} />
        {mandate.priorities.length > 0 && <Fact label="Priorities" value={mandate.priorities.join(' · ')} />}
        <Fact label="Working instructions" value={mandate.workingInstructions} />
        <Fact label="Revision" value={`${mandate.revision} · ${formatRelative(mandate.updatedAt)}`} />
        <p className="rounded-lg border border-room-line px-[11px] py-2.5 text-[10px] leading-[1.55] text-room-text4">
          <b className="text-room-text3">A mandate change is instructions only.</b> Giving this member a new
          tool, model, skill or permission is a configuration change — validated against the envelope, applied at
          a safe turn boundary, and it needs your approval when it widens access.
        </p>
      </TabPanel>
    );
  }

  if (tab === 'context') {
    return (
      <TabPanel tab={tab}>
        <ContextMeter context={context} member={member} />
        <Fact label="Compactions" value={`${session.compactionCount}${session.lastCompactedAt ? ` · ${formatClock(session.lastCompactedAt)}` : ''}`} />
        <Fact label="Model" value={`${configuration.model} · ${configuration.thinking}`} />
        <Fact label="Tools" value={configuration.tools.join(', ') || 'none'} />
        <Fact label="Skills" value={configuration.skills.join(', ') || 'none'} />
        <Fact label="Access" value={configuration.permissions} />
        <p className="text-[10px] leading-[1.55] text-room-text4">
          Compaction happens at a safe turn boundary. The member's checkpoint, mandate and the part of the Room
          brief that concerns it are carried across; its session history is unchanged.
        </p>
      </TabPanel>
    );
  }

  if (tab === 'worktree') {
    return (
      <TabPanel tab={tab}>
        {member.worktreePath ? (
          <>
            <Fact label="Branch" value={member.worktreeBranch ?? '—'} mono />
            <Fact label="Path" value={member.worktreePath} mono />
            <p className="text-[10px] leading-[1.55] text-room-text4">
              This member edits in its own checkout, so nothing it does touches another member's files. Its work
              is collected when the Room finishes.
            </p>
          </>
        ) : (
          <p className="text-xs text-room-text4">This member has no checkout of its own.</p>
        )}
      </TabPanel>
    );
  }

  if (tab === 'cost') {
    return (
      <TabPanel tab={tab}>
        <Fact label="Spent" value={`${formatCost(usage.costUsd)} of ${formatCost(maxCostUsd)}`} />
        <Fact label="Turns" value={`${usage.turns}`} />
        <Fact label="Input tokens" value={formatTokens(usage.inputTokens)} />
        <Fact label="Output tokens" value={formatTokens(usage.outputTokens)} />
        <Fact label="Cache read" value={formatTokens(usage.cacheReadTokens)} />
        <Fact label="Retries" value={`${usage.retries}`} />
      </TabPanel>
    );
  }

  return null;
}

/** Each tab's body is the panel its tab controls, and says so. */
function TabPanel({ tab, children }: { tab: MemberTab; children: React.ReactNode }) {
  return (
    <div role="tabpanel" aria-label={MEMBER_TAB_LABEL[tab]} className="flex flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-3.5">
      {children}
    </div>
  );
}

/** The 6px context track with its legend (prototype `.ctx-meter`). */
function ContextMeter({ context, member }: { context: PersistentSessionContextUsage | null; member: RoomMember }) {
  if (!context) {
    return (
      <div>
        <Eyebrow>Context</Eyebrow>
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
      <Eyebrow>Context</Eyebrow>
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

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="room-mono-micro uppercase tracking-[0.07em] text-room-text4">{label}</p>
      <p className={cn('mt-1 text-xs text-room-text2', mono && 'room-tabular break-all text-[10px] text-room-text3')}>{value}</p>
    </div>
  );
}
