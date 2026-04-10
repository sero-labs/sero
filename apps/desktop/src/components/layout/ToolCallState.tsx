/**
 * Pure state helpers and tiny JSX primitives for tool call display.
 * Extracted from ToolCallHelpers.tsx to keep component files under 500 LOC.
 */
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import type { ChatToolCallMessage } from '@/types/ipc';
import { getToolProgressHeaderText } from './ToolCallProgress';

// ── Map tool state ──────────────────────────────────────────────

export function mapToolState(
  state: ChatToolCallMessage['state'],
): 'input-streaming' | 'input-available' | 'output-available' | 'output-error' {
  switch (state) {
    case 'pending':
      return 'input-streaming';
    case 'running':
      return 'input-available';
    case 'completed':
      return 'output-available';
    case 'error':
    case 'cancelled':
      return 'output-error';
  }
}

// ── Group status helpers ────────────────────────────────────────

export type GroupStatus = 'running' | 'completed' | 'error' | 'cancelled';

export function deriveGroupStatus(tools: ChatToolCallMessage[]): GroupStatus {
  const hasRunning = tools.some((t) => t.state === 'pending' || t.state === 'running');
  const hasCancelled = tools.some((t) => t.state === 'cancelled');
  const hasError = tools.some((t) => t.state === 'error');

  if (hasRunning) return 'running';
  if (hasCancelled) return 'cancelled';
  if (hasError) return 'error';
  return 'completed';
}

export function groupStatusIcon(status: GroupStatus) {
  switch (status) {
    case 'running':
      return <Loader2 className="size-3.5 animate-spin text-[var(--status-info)]" />;
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-[var(--status-success)]" />;
    case 'error':
      return <XCircle className="size-3.5 text-[var(--status-error)]" />;
    case 'cancelled':
      return <AlertCircle className="size-3.5 text-[var(--status-warning)]" />;
  }
}

export function groupStatusLabel(status: GroupStatus, count: number) {
  const noun = count === 1 ? 'action' : 'actions';
  switch (status) {
    case 'running':
      return `Running ${count} ${noun}…`;
    case 'completed':
      return `${count} ${noun} completed`;
    case 'error':
      return `${count} ${noun}`;
    case 'cancelled':
      return `${count} ${noun} (cancelled)`;
  }
}

// ── Status dot (collapsed view indicator) ───────────────────────

export function toolStatusDot(state: ChatToolCallMessage['state']) {
  switch (state) {
    case 'pending':
      return <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />;
    case 'running':
      return <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--status-info)]" />;
    case 'completed':
      return <span className="size-1.5 shrink-0 rounded-full bg-[var(--status-success)]" />;
    case 'error':
      return <span className="size-1.5 shrink-0 rounded-full bg-[var(--status-error)]" />;
    case 'cancelled':
      return <span className="size-1.5 shrink-0 rounded-full bg-[var(--status-warning)]" />;
  }
}

// ── Shared summary extraction ───────────────────────────────────

function extractToolSummary(input: Record<string, unknown>): string {
  if (input.command && typeof input.command === 'string') return input.command;
  if (input.path && typeof input.path === 'string') return input.path;
  if (input.file_path && typeof input.file_path === 'string') return input.file_path as string;
  if (input.query && typeof input.query === 'string') return input.query;
  if (input.pattern && typeof input.pattern === 'string') return input.pattern;
  if (input.url && typeof input.url === 'string') return input.url;
  const first = Object.values(input).find((v) => typeof v === 'string');
  return typeof first === 'string' ? first : '';
}

function summarizeToolOutput(output: string | null): string | null {
  if (!output) return null;
  const firstLine = output
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;
  return firstLine.length > 96 ? `${firstLine.slice(0, 93)}...` : firstLine;
}

export function getCollapsedToolSummary(tool: ChatToolCallMessage): string {
  const progressHeader = getToolProgressHeaderText(tool);
  if (progressHeader) return progressHeader;

  if (tool.toolName === 'sero-cli' && (tool.state === 'completed' || tool.state === 'error')) {
    const outputSummary = summarizeToolOutput(tool.output);
    if (outputSummary) return outputSummary;
  }

  return extractToolSummary(tool.input);
}
