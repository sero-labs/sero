/**
 * QuestionnaireNotice, friendly inline replacement for questionnaire/interview
 * related tool calls. Used for both direct tool calls and bridged `sero-cli`
 * commands such as `sero questionnaire ...` and `sero help questionnaire`.
 */

import { useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, ChevronRight, Loader2, X } from 'lucide-react';
import { IconAction } from '@/components/ui/IconAction';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import type { ChatToolCallMessage } from '@/types/ipc';

type FeedbackKind = 'questionnaire' | 'interview';
type FeedbackNoticeMode = 'preparing' | 'active' | 'completed';

interface Props {
  tools: ChatToolCallMessage[];
  sessionLabel?: string | null;
}

interface ToolClassification {
  kind: FeedbackKind;
  mode: 'preparing' | 'interactive';
}

function getBridgedCommand(tool: ChatToolCallMessage): string | null {
  const command = tool.input.command;
  if (tool.toolName !== 'sero-cli' || typeof command !== 'string') return null;
  const firstLine = command
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? null;
}

function getCommandTokens(command: string): string[] {
  const tokens = command.split(/\s+/).filter(Boolean);
  if (tokens[0] === 'sero') tokens.shift();
  return tokens;
}

function classifyTool(tool: ChatToolCallMessage): ToolClassification | null {
  if (tool.toolName === 'questionnaire' || tool.toolName === 'interview') {
    return { kind: tool.toolName, mode: 'interactive' };
  }

  const bridgedCommand = getBridgedCommand(tool);
  if (!bridgedCommand) return null;

  const tokens = getCommandTokens(bridgedCommand);
  const first = tokens[0];
  const second = tokens[1];

  if (first === 'questionnaire' || first === 'interview') {
    return { kind: first, mode: 'interactive' };
  }

  if (first === 'help' && (second === 'questionnaire' || second === 'interview')) {
    return { kind: second, mode: 'preparing' };
  }

  return null;
}

export function getFeedbackToolGroupDisposition(
  tools: ChatToolCallMessage[],
): 'hide' | 'notice' | null {
  const classification = pickPreferredClassification(tools);
  if (!classification) return null;
  return classification.mode === 'preparing' ? 'hide' : 'notice';
}

function pickPreferredClassification(tools: ChatToolCallMessage[]): ToolClassification | null {
  let preparing: ToolClassification | null = null;

  for (const tool of tools) {
    const classification = classifyTool(tool);
    if (!classification) continue;
    if (classification.mode === 'interactive') return classification;
    if (!preparing) preparing = classification;
  }

  return preparing;
}

function getQuestionCount(tools: ChatToolCallMessage[]): number {
  const firstInteractiveTool = tools.find((tool) => {
    const classification = classifyTool(tool);
    return classification?.mode === 'interactive';
  });
  if (!firstInteractiveTool) return 0;

  const rawInput = firstInteractiveTool.input;
  const questionsArr = rawInput && typeof rawInput === 'object' && 'questions' in rawInput
    ? (rawInput as { questions: unknown }).questions
    : undefined;
  return Array.isArray(questionsArr) ? questionsArr.length : 0;
}

function getMode(
  tools: ChatToolCallMessage[],
  hasPending: boolean,
  classification: ToolClassification,
): FeedbackNoticeMode {
  if (hasPending) return 'active';

  const matchingTools = tools.filter((tool) => {
    const next = classifyTool(tool);
    return next?.kind === classification.kind && next.mode === classification.mode;
  });

  const hasRunningMatchingTool = matchingTools.some(
    (tool) => tool.state === 'pending' || tool.state === 'running',
  );

  if (classification.mode === 'preparing') {
    return hasRunningMatchingTool ? 'preparing' : 'completed';
  }

  return hasRunningMatchingTool ? 'active' : 'completed';
}

function getPrimaryLabel(kind: FeedbackKind, isOnboarding: boolean): string {
  if (isOnboarding && kind === 'questionnaire') return 'Setup questions';
  return kind === 'interview' ? 'Interview' : 'Questions';
}

function getSecondaryLabel(mode: FeedbackNoticeMode, kind: FeedbackKind): string {
  if (mode === 'preparing') return 'Preparing...';
  if (mode === 'completed') return 'Completed';
  return kind === 'interview' ? 'Open in User Feedback' : 'Continue in User Feedback';
}

export function QuestionnaireNotice({ tools, sessionLabel = null }: Props) {
  const classification = useMemo(() => pickPreferredClassification(tools), [tools]);
  const isOnboarding = sessionLabel === 'Welcome';

  const pendingQuestionnaire = useUserFeedbackStore((store) => store.getPending('questionnaire'));
  const pendingInterview = useUserFeedbackStore((store) => store.getPending('interview'));
  const cancel = useUserFeedbackStore((store) => store.cancel);
  const openFeedbackApp = useUserFeedbackStore((store) => store.openFeedbackApp);

  const pending = classification?.kind === 'interview' ? pendingInterview : pendingQuestionnaire;
  const count = pending?.questions.length ?? getQuestionCount(tools);
  const mode = classification ? getMode(tools, Boolean(pending), classification) : 'completed';
  const label = classification
    ? getPrimaryLabel(classification.kind, isOnboarding)
    : 'Questions';
  const secondary = classification
    ? getSecondaryLabel(mode, classification.kind)
    : 'Completed';
  const clickable = mode === 'active' && Boolean(pending);

  const handleClick = useCallback(() => {
    if (!clickable) return;
    openFeedbackApp();
  }, [clickable, openFeedbackApp]);

  const handleCancel = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (pending) {
        void cancel(pending.id);
      }
    },
    [cancel, pending],
  );

  if (!classification) return null;

  return (
    <motion.div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${label}, ${secondary}` : label}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (!clickable) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleClick();
        }
      }}
      className={[
        'overflow-hidden rounded-lg border px-3 py-2',
        'transition-colors',
        clickable
          ? 'cursor-pointer border-status-info-border bg-status-info-faint hover:bg-status-info-muted'
          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50',
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5">
        <ChevronRight className="size-3.5 text-[var(--text-muted)]" />
        {mode === 'completed' ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-status-success" />
        ) : mode === 'preparing' ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--text-muted)]" />
        ) : (
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-status-info" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-medium text-[var(--text-primary)]">
              {label}
            </span>
            {count > 0 ? (
              <span className="shrink-0 rounded-full bg-[var(--bg-surface)] px-1.5 py-0.5 text-sm text-[var(--text-muted)]">
                {count}
              </span>
            ) : null}
          </div>
          <p className="truncate text-sm text-[var(--text-secondary)]">{secondary}</p>
        </div>

        {clickable && pending ? (
          <IconAction
            onClick={handleCancel}
            aria-label={`Cancel ${label.toLowerCase()}`}
            className="hover:bg-[var(--bg-elevated)]"
            title={`Cancel ${label.toLowerCase()}`}
          >
            <X className="size-3.5" />
          </IconAction>
        ) : null}
      </div>
    </motion.div>
  );
}
