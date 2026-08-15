/**
 * The member session's transcript devices (prototype screen 10): the turn-mark
 * strip, the collapsed early history, the turn blocks with their room/tool
 * bubbles, the compaction gradient rule, and the live tool card.
 *
 * Everything here renders the session file as it is — nothing is a
 * reconstruction. Room input and member output use explicit sender labels;
 * green is reserved for the live state rather than historical message roles.
 */

import { Button } from '@sero-ai/ui';
import { cn } from '@sero-ai/ui/lib/utils';
import type { PersistentSessionHistoryEntry } from '@sero-ai/common';
import type { LiveToolCall } from '../../shared/room-live-types';
import { formatClock, formatTimer } from '../lib/format';
import type { SessionTurn } from '../lib/room-view';
import { Pill } from './room-kit';

/** The running tool, streamed from the session: spinner, command, stopwatch. */
export function ToolLiveCard({ tool, className }: { tool: LiveToolCall; className?: string }) {
  return (
    <div className={cn('flex items-center gap-[9px] rounded-lg border border-brand-primary-border bg-room-surface px-3 py-[9px]', className)}>
      <span aria-hidden className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-brand-primary-border border-t-brand-primary" />
      <span className="room-tabular min-w-0 flex-1 truncate text-[10px] text-room-text3">
        {tool.toolName} {tool.summary}
      </span>
      <span className="room-mono-micro shrink-0 text-room-text4">
        {formatTimer(Date.now() - new Date(tool.startedAt).getTime())}
      </span>
    </div>
  );
}

/**
 * The whole session at a glance: one 15×20 mark per turn — compactions
 * emerald, turns with tool calls blue-washed, the live turn solid — so a user
 * can jump anywhere in the history, including before a compaction. The file
 * kept it, so the panel must be able to reach it.
 */
export function TurnStrip({
  turns,
  liveTurn,
  onJump,
}: {
  turns: SessionTurn[];
  /** The in-flight turn gets the solid `now` mark. */
  liveTurn: boolean;
  onJump: (index: number) => void;
}) {
  if (turns.length === 0) return null;
  const compactions = turns.filter((turn) => turn.compacted).length;
  const toolCalls = turns.reduce((n, turn) => n + turn.entries.filter((entry) => entry.role === 'tool').length, 0);

  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-room-line px-[18px] py-[7px]">
      <span className="room-mono-micro mr-[3px] shrink-0 uppercase tracking-[0.07em] text-room-text4">Turns</span>
      {turns.map((turn, i) => {
        const isNow = liveTurn && i === turns.length - 1;
        return (
          <button
            key={turn.index}
            type="button"
            title={`Turn ${turn.index} · ${formatClock(turn.at)}`}
            aria-label={`Go to turn ${turn.index}${turn.compacted ? ', compacted' : ''}`}
            onClick={() => onJump(turn.index)}
            className={cn(
              'h-5 w-[15px] shrink-0 rounded-[3px]',
              isNow
                ? 'bg-brand-primary shadow-[0_0_0_2px_var(--brand-primary-subtle)]'
                : turn.compacted
                  ? 'bg-brand-primary-subtle'
                  : turn.entries.some((entry) => entry.role === 'tool')
                    ? 'bg-status-info-subtle'
                    : 'bg-room-muted',
              'hover:opacity-80',
            )}
          />
        );
      })}
      <span className="ml-auto flex shrink-0 gap-1.5">
        {compactions > 0 && <Pill>Compactions {compactions}</Pill>}
        {toolCalls > 0 && <Pill>Tool calls {toolCalls}</Pill>}
      </span>
    </div>
  );
}

/** `Turns 1–5 · 11 tool calls` — the folded early history. */
export function CollapsedHistory({ turns, onShow }: { turns: SessionTurn[]; onShow: () => void }) {
  const toolCalls = turns.reduce((n, turn) => n + turn.entries.filter((entry) => entry.role === 'tool').length, 0);
  return (
    <div className="mb-3.5 flex items-center gap-2.5 rounded-lg border border-dashed border-room-line-strong px-3 py-[9px] text-[11px] text-room-text4">
      Turns {turns[0].index}–{turns[turns.length - 1].index} · {formatClock(turns[0].at)} to{' '}
      {formatClock(turns[turns.length - 1].at)} · {toolCalls} tool calls
      <Button variant="outline" className="ml-auto h-6 px-2 text-[10px]" onClick={onShow}>
        Show
      </Button>
    </div>
  );
}

/** The violet gradient rule where the context was compacted in place. */
function CompactMark({ at }: { at: string }) {
  return (
    <div className="my-4 flex items-center gap-2.5 text-[11px] text-collab-primary">
      <span aria-hidden className="h-px flex-1 bg-linear-to-r from-transparent via-collab-primary-border to-transparent" />
      Context compacted at {formatClock(at)} — the checkpoint, mandate and Room brief were carried across
      <span aria-hidden className="h-px flex-1 bg-linear-to-r from-transparent via-collab-primary-border to-transparent" />
    </div>
  );
}

function Bubble({ entry, memberName }: { entry: PersistentSessionHistoryEntry; memberName: string }) {
  if (entry.role === 'tool') {
    return (
      <div className="room-tabular mt-2 whitespace-pre-wrap rounded-[9px] border border-room-line bg-room-sunken px-[13px] py-[11px] text-[10px] leading-[1.6] text-room-text4">
        {entry.text}
      </div>
    );
  }
  // A user-role entry in a member session IS the Room speaking to the member.
  const speaker = entry.role === 'user' ? 'Room' : memberName;
  return (
    <div className="mt-2 whitespace-pre-wrap rounded-[9px] border border-room-line bg-room-surface px-[13px] py-[11px] text-xs leading-[1.6] text-room-text3">
      <b className="room-mono-micro mb-1.5 block font-bold uppercase tracking-[0.08em] text-room-text2">{speaker}</b>
      {entry.text}
    </div>
  );
}

export function TurnBlock({ memberId, memberName, turn, live = false }: { memberId: string; memberName: string; turn: SessionTurn; live?: boolean }) {
  return (
    <div id={`turn-${memberId}-${turn.index}`}>
      {turn.compacted && <CompactMark at={turn.at} />}
      <div className="room-mono-micro flex items-center gap-2 uppercase tracking-[0.06em] text-room-text4">
        Turn {turn.index} · {formatClock(turn.at)}{live && ' · in progress'}
        <span aria-hidden className="h-px flex-1 bg-room-line" />
      </div>
      {turn.entries.map((entry, position) => (
        <Bubble key={`${entry.timestamp}:${position}`} entry={entry} memberName={memberName} />
      ))}
    </div>
  );
}

/** The in-flight turn: retained text with the caret, and the running tool. */
export function LiveTurn({ memberName, text, tool, turnIndex }: { memberName: string; text: string; tool: LiveToolCall | null; turnIndex: number }) {
  return (
    <div>
      <div className="room-mono-micro flex items-center gap-2 uppercase tracking-[0.06em] text-room-text4">
        Turn {turnIndex} · in progress
        <span aria-hidden className="h-px flex-1 bg-room-line" />
      </div>
      {text && (
        <div className="mt-2 whitespace-pre-wrap rounded-[9px] border border-brand-primary-border bg-room-surface px-[13px] py-[11px] text-xs leading-[1.6] text-room-text3">
          <b className="room-mono-micro mb-1.5 block font-bold uppercase tracking-[0.08em] text-room-text2">
            {memberName} · Live
          </b>
          {text}
          <span aria-hidden className="ml-0.5 inline-block h-3 w-[1.5px] translate-y-0.5 bg-room-text3" />
        </div>
      )}
      {tool && <ToolLiveCard tool={tool} className="mt-2" />}
    </div>
  );
}
