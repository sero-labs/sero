/**
 * What a member IS, beside what it is saying (prototype screen 10, right side
 * and the Mandate / Context / Worktree / Cost tabs).
 *
 * The split matters: a mandate is instructions and the user may see it change
 * freely, while a model, tool, skill or permission is authority and only ever
 * changes through a validated revision. The panel says so, because the two look
 * equally editable from outside and are not.
 */

import type { PersistentSessionContextUsage } from '@sero-ai/common';
import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { RoomMember } from '../../shared/room-types';
import { formatCost, formatRelative, formatTime, formatTokens } from '../lib/format';

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

/** The "doing right now" rail that sits beside the transcript. */
export function MemberLiveRail({ member, live, context }: Omit<FactsProps, 'maxCostUsd'>) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-auto border-l border-border p-3">
      <Eyebrow>Doing right now</Eyebrow>
      {live?.toolInFlight ? (
        <p className="break-words font-mono text-xs">
          {live.toolInFlight.toolName} · {live.toolInFlight.summary}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{member.statusDetail}</p>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Streamed from the session itself as it happens — the same output the member is producing, not a summary
        of it.
      </p>

      <ContextMeter context={context} member={member} />

      <Fact label="Turns" value={`${member.usage.turns}`} />
      <Fact label="Cost" value={formatCost(member.usage.costUsd)} />
      {member.worktreePath && <Fact label="Worktree" value={member.worktreeBranch ?? member.worktreePath} mono />}

      <p className="rounded-md border border-border p-2 text-xs leading-relaxed text-muted-foreground">
        <b className="text-foreground">This is a real session, not a chat.</b> It lives in this Room's session
        folder, so it never appears in your chat history, and it stays readable for as long as the Room exists —
        including after the member retires.
      </p>
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
        <p className="rounded-md border border-border p-2 text-xs leading-relaxed text-muted-foreground">
          <b className="text-foreground">A mandate change is instructions only.</b> Giving this member a new
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
        <Fact label="Compactions" value={`${session.compactionCount}${session.lastCompactedAt ? ` · ${formatTime(session.lastCompactedAt)}` : ''}`} />
        <Fact label="Model" value={`${configuration.model} · ${configuration.thinking}`} />
        <Fact label="Tools" value={configuration.tools.join(', ') || 'none'} />
        <Fact label="Skills" value={configuration.skills.join(', ') || 'none'} />
        <Fact label="Access" value={configuration.permissions} />
        <p className="text-xs leading-relaxed text-muted-foreground">
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
            <p className="text-xs leading-relaxed text-muted-foreground">
              This member edits in its own checkout, so nothing it does touches another member's files. Its work
              is collected when the Room finishes.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">This member has no checkout of its own.</p>
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
    <div role="tabpanel" aria-label={MEMBER_TAB_LABEL[tab]} className="flex flex-1 flex-col gap-3 overflow-auto p-3">
      {children}
    </div>
  );
}

function ContextMeter({ context, member }: { context: PersistentSessionContextUsage | null; member: RoomMember }) {
  if (!context) {
    return (
      <div>
        <Eyebrow>Context</Eyebrow>
        <p className="mt-1 text-xs text-muted-foreground">
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
      <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
        <span
          className={`block h-full rounded-full ${pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatTokens(context.usedTokens)} of {formatTokens(context.maxTokens)} used
      </p>
    </div>
  );
}

function Eyebrow({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm ${mono ? 'break-all font-mono text-xs' : ''}`}>{value}</p>
    </div>
  );
}
