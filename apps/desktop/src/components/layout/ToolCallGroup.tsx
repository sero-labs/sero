import { useState, useMemo, useRef, memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Columns2, List, WrenchIcon } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ChatMessage, ChatToolCallMessage } from '@/types/ipc';
import { useAppStore } from '@/stores/app';
import {
  deriveGroupStatus,
  groupStatusIcon,
  groupStatusLabel,
} from './ToolCallState';
import { SingleToolCall } from './tool-call-helpers/SingleToolCall';
import { getImagePaths, ToolFileLinks } from './tool-call-helpers/ToolFileLinks';
import { ToolImages } from './tool-call-helpers/ToolImages';
import { ToolRailPane } from './tool-call-helpers/ToolRailPane';
import { ToolRows } from './tool-call-helpers/ToolRows';

// ── Types ───────────────────────────────────────────────────────

export type GroupedChatItem =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'tool-group'; tools: ChatToolCallMessage[]; id: string };

function isStreamingThinkingOnlyAssistantMessage(message: ChatMessage): boolean {
  return (
    message.type === 'assistant'
    && !message.text?.trim()
    && Boolean(message.thinking)
    && message.isStreaming
  );
}

function isSessionTitleToolCall(tool: ChatToolCallMessage): boolean {
  if (tool.toolName === 'set_session_title') return true;
  if (tool.toolName !== 'sero-cli' || typeof tool.input.command !== 'string') return false;

  const commands = tool.input.command
    .split('\n')
    .map((command) => command.trim())
    .filter(Boolean);
  if (commands.length !== 1) return false;

  const command = commands[0];
  if (!/^(?:sero\s+)?set-title(?:\s|$)/.test(command)) return false;

  // Only the automatic first-turn title carries --if-unnamed. An explicit
  // user-requested rename omits it and stays visible so the user sees it land.
  return /(?:^|\s)--if-unnamed(?:\s|$)/.test(command);
}

// ── Grouping utility ────────────────────────────────────────────

/**
 * Groups consecutive tool messages into collapsed blocks.
 * Non-empty text messages (user / assistant with content) break the grouping.
 *
 * Assistant messages that have no visible response text are treated as
 * ephemeral UI state rather than durable turn boundaries:
 * - empty assistant placeholders are dropped
 * - thinking-only assistant messages are only kept while they are the live,
 *   trailing streaming message
 *
 * This lets a single turn reuse one ToolCallGroup even when the model emits
 * intermediate reasoning-only assistant messages between tool-use blocks.
 */
export function groupMessages(
  messages: ChatMessage[],
): GroupedChatItem[] {
  const result: GroupedChatItem[] = [];
  let toolBuffer: ChatToolCallMessage[] = [];

  const flushTools = () => {
    if (toolBuffer.length === 0) return;
    result.push({
      kind: 'tool-group',
      tools: [...toolBuffer],
      id: `tg-${toolBuffer[0].id}`,
    });
    toolBuffer = [];
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.type === 'tool') {
      // Session titles are background chat metadata, not meaningful agent work.
      if (isSessionTitleToolCall(msg)) continue;
      toolBuffer.push(msg);
      continue;
    }

    if (msg.type === 'assistant' && !msg.text?.trim()) {
      const isLastMessage = i === messages.length - 1;
      const keepTrailingThinking = isLastMessage && isStreamingThinkingOnlyAssistantMessage(msg);
      if (!keepTrailingThinking) {
        continue;
      }
    }

    flushTools();
    result.push({ kind: 'message', message: msg });
  }
  flushTools();

  return result;
}

/**
 * A tool group is only finalized once a durable message follows it.
 * Trailing streaming thinking is visible UI state, not a real turn boundary.
 */
export function isToolGroupFinalized(
  items: GroupedChatItem[],
  index: number,
): boolean {
  for (let i = index + 1; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'message' && isStreamingThinkingOnlyAssistantMessage(item.message)) {
      continue;
    }
    return true;
  }
  return false;
}

// ── Main ToolCallGroup component ────────────────────────────────

const VISIBLE_TOOL_LIMIT = 10;

function getVisibleTools(tools: ChatToolCallMessage[]): ChatToolCallMessage[] {
  return tools.slice(-VISIBLE_TOOL_LIMIT);
}

function toolDisplayFieldsEqual(a: ChatToolCallMessage, b: ChatToolCallMessage): boolean {
  return a.id === b.id
    && a.state === b.state
    && a.output === b.output
    && a.isPartialOutput === b.isPartialOutput
    // A streaming write changes only its input, so comparing the rest would
    // freeze the live view after its first frame. The store replaces `input`
    // per delta, making this a cheap reference check.
    && a.input === b.input
    && a.details === b.details
    && a.images === b.images;
}

/**
 * @param tools      , tool messages in this group
 * @param isFinalized, true when a durable, non-ephemeral message follows this group
 * @param workspaceId, workspace ID for ctrl+click file path support
 */
export const ToolCallGroup = memo(function ToolCallGroup({
  tools,
  isFinalized = true,
  workspaceId = null,
}: {
  tools: ChatToolCallMessage[];
  isFinalized?: boolean;
  workspaceId?: string | null;
}) {
  const status = deriveGroupStatus(tools);
  const isRunning = status === 'running';
  const visibleTools = useMemo(() => getVisibleTools(tools), [tools]);
  const latestImageTool = useMemo(
    () => [...visibleTools].reverse().find((tool) => tool.images?.length),
    [visibleTools],
  );
  const fileLinkPaths = useMemo(
    () => [...new Set(visibleTools.flatMap((tool) => getImagePaths(tool.details)))],
    [visibleTools],
  );

  const toolCallLayout = useAppStore((state) => state.toolCallLayout);
  const setToolCallLayout = useAppStore((state) => state.setToolCallLayout);

  // Track whether the group was ever running (live) vs loaded from history.
  const wasEverRunning = useRef(isRunning);
  if (isRunning) wasEverRunning.current = true;

  // Manual toggle override, `null` means follow automatic behaviour.
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);

  // Auto behaviour:
  //  - Live group, not finalized: stay expanded (tools may still arrive)
  //  - Live group, finalized + all done: collapse
  //  - Loaded group (never ran): stay collapsed
  const autoExpanded = wasEverRunning.current ? (!isFinalized || isRunning) : false;
  const expanded = manualExpanded ?? autoExpanded;

  // Single tool: render with matching group-style wrapper
  if (tools.length === 1) {
    return <SingleToolCall tool={tools[0]} workspaceId={workspaceId} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group/tg overflow-hidden rounded-lg border transition-colors duration-200',
        isRunning
          ? 'border-status-info-border bg-status-info-faint'
          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50',
      )}
    >
      {/* Summary bar */}
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setManualExpanded(!expanded)}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150',
            'hover:bg-[var(--bg-elevated)]/80',
          )}
        >
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <ChevronRight className="size-3.5 text-[var(--text-muted)]" />
          </motion.div>

          <WrenchIcon className="size-3.5 text-[var(--text-muted)]" />
          {groupStatusIcon(status)}

          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {groupStatusLabel(status, tools.length)}
          </span>
        </button>

        {expanded ? (
          <div
            role="group"
            aria-label="Tool detail layout"
            className="mr-2 flex items-center rounded-md bg-[var(--bg-elevated)]/60 p-0.5"
          >
            <button
              type="button"
              aria-label="Rows layout"
              aria-pressed={toolCallLayout === 'rows'}
              onClick={() => setToolCallLayout('rows')}
              className={cn(
                'rounded p-1 text-[var(--text-muted)] transition-colors',
                toolCallLayout === 'rows' && 'bg-[var(--bg-surface)] text-[var(--text-primary)]',
              )}
            >
              <List className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Rail layout"
              aria-pressed={toolCallLayout === 'rail'}
              onClick={() => setToolCallLayout('rail')}
              className={cn(
                'rounded p-1 text-[var(--text-muted)] transition-colors',
                toolCallLayout === 'rail' && 'bg-[var(--bg-surface)] text-[var(--text-primary)]',
              )}
            >
              <Columns2 className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {!expanded && latestImageTool?.images?.length ? (
        <div className="border-t border-[var(--border-subtle)] px-3 py-2">
          <ToolImages images={latestImageTool.images} workspaceId={workspaceId} />
        </div>
      ) : null}

      {!expanded && fileLinkPaths.length ? (
        <div className="border-t border-[var(--border-subtle)]">
          <ToolFileLinks imagePaths={fileLinkPaths} workspaceId={workspaceId} />
        </div>
      ) : null}

      {/* Expanded: one detail per tool, in the configured layout */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border-subtle)]">
              {toolCallLayout === 'rail' ? (
                <ToolRailPane
                  tools={visibleTools}
                  workspaceId={workspaceId}
                  onDetailOpen={() => setManualExpanded(true)}
                />
              ) : (
                <ToolRows
                  tools={visibleTools}
                  workspaceId={workspaceId}
                  onDetailOpen={() => setManualExpanded(true)}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}, (prev, next) => {
  if (prev.isFinalized !== next.isFinalized || prev.workspaceId !== next.workspaceId) return false;
  if (prev.tools.length !== next.tools.length) return false;
  if (deriveGroupStatus(prev.tools) !== deriveGroupStatus(next.tools)) return false;

  const prevVisibleTools = getVisibleTools(prev.tools);
  const nextVisibleTools = getVisibleTools(next.tools);
  for (let i = 0; i < prevVisibleTools.length; i++) {
    const previousTool = prevVisibleTools[i];
    const nextTool = nextVisibleTools[i];
    if (!previousTool || !nextTool || !toolDisplayFieldsEqual(previousTool, nextTool)) return false;
  }
  return true;
});
