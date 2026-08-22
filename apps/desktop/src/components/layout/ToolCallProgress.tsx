import { Globe, Search } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ChatToolCallMessage } from '@/types/ipc';

interface ToolProgressModel {
  icon: typeof Search;
  title: string;
  subtitle?: string;
  progressPct?: number | null;
  indeterminate?: boolean;
  badges: string[];
  rawText?: string | null;
}

interface ToolBatchProgress {
  commandIndex?: number;
  commandCount?: number;
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

export function getEffectiveToolName(tool: ChatToolCallMessage): string {
  const bridged = getBridgedCommand(tool);
  if (!bridged) return tool.toolName;
  const tokens = bridged.split(/\s+/).filter(Boolean);
  if (tokens[0] === 'sero') tokens.shift();
  return tokens[0] || tool.toolName;
}

function getBatchProgress(details: Record<string, unknown> | null): ToolBatchProgress {
  return {
    commandIndex: asNumber(details?.commandIndex),
    commandCount: asNumber(details?.commandCount),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s elapsed`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs === 0 ? `${mins}m elapsed` : `${mins}m ${secs}s elapsed`;
}

function parseSearchProgress(rawText: string | null | undefined): {
  current?: number;
  total?: number;
  query?: string;
} {
  if (!rawText) return {};
  const match = rawText.match(/Searching\s+(\d+)\/(\d+):\s+"([^"]+)"/i);
  if (!match) return {};
  return {
    current: Number.parseInt(match[1] ?? '', 10),
    total: Number.parseInt(match[2] ?? '', 10),
    query: match[3]?.trim(),
  };
}

function parseSearchProgressPct(current?: number, total?: number, fallback?: number): number | null {
  if (typeof current === 'number' && typeof total === 'number' && total > 0) {
    return clampProgress((current / total) * 100);
  }
  if (typeof fallback === 'number') return clampProgress(fallback * 100);
  return null;
}

function buildWebSearchProgress(tool: ChatToolCallMessage): ToolProgressModel {
  const details = asRecord(tool.details);
  const parsed = parseSearchProgress(tool.output);
  const currentQuery = parsed.query ?? asString(details?.currentQuery);
  const batch = getBatchProgress(details);
  const current = batch.commandCount && batch.commandCount > 1
    ? batch.commandIndex
    : parsed.current;
  const total = batch.commandCount && batch.commandCount > 1
    ? batch.commandCount
    : parsed.total;
  const progressPct = parseSearchProgressPct(current, total, asNumber(details?.progress));

  return {
    icon: Search,
    title: 'Searching the web',
    subtitle: currentQuery,
    progressPct,
    badges: [
      typeof current === 'number' && typeof total === 'number' && total > 0
        ? `Query ${current} of ${total}`
        : 'Searching',
    ],
    rawText: tool.output,
  };
}

function buildFetchProgress(tool: ChatToolCallMessage): ToolProgressModel {
  const details = asRecord(tool.details);
  const phase = asString(details?.phase) ?? 'Fetching content';
  const elapsedSec = asNumber(details?.elapsedSec);
  const progress = asNumber(details?.progress);

  const bridgedCommand = getBridgedCommand(tool);
  const commandUrlMatches = bridgedCommand
    ? [...bridgedCommand.matchAll(/--url\s+"([^"]+)"|--url\s+(\S+)/g)]
    : [];
  const commandUrls = commandUrlMatches
    .map((match) => match[1] ?? match[2])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const urls = Array.isArray(tool.input.urls)
    ? tool.input.urls.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : commandUrls;
  const urlCount = urls.length > 0
    ? urls.length
    : typeof tool.input.url === 'string' && tool.input.url.trim().length > 0
      ? 1
      : commandUrls.length > 0
        ? commandUrls.length
        : undefined;

  return {
    icon: Globe,
    title: phase,
    subtitle: urlCount === 1 ? '1 URL in progress' : urlCount ? `${urlCount} URLs in progress` : undefined,
    progressPct: typeof progress === 'number' && progress > 0 ? clampProgress(progress * 100) : null,
    indeterminate: !(typeof progress === 'number' && progress > 0),
    badges: [
      urlCount === 1 ? '1 URL' : urlCount ? `${urlCount} URLs` : 'Preparing',
      ...(typeof elapsedSec === 'number' && elapsedSec > 0 ? [formatElapsed(elapsedSec)] : []),
    ],
    rawText: tool.output,
  };
}

export function buildToolProgressModel(tool: ChatToolCallMessage): ToolProgressModel | null {
  if (tool.state !== 'running' || !tool.isPartialOutput) return null;
  const effectiveToolName = getEffectiveToolName(tool);
  if (effectiveToolName === 'web_search') return buildWebSearchProgress(tool);
  if (effectiveToolName === 'fetch_content') return buildFetchProgress(tool);
  return null;
}

export function getToolProgressHeaderText(tool: ChatToolCallMessage): string | null {
  const model = buildToolProgressModel(tool);
  if (!model) return null;

  const effectiveToolName = getEffectiveToolName(tool);
  const primaryBadge = model.badges[0];

  if (effectiveToolName === 'web_search') {
    return primaryBadge && primaryBadge.startsWith('Query ')
      ? `Searching ${primaryBadge.toLowerCase()}…`
      : 'Searching the web…';
  }

  if (effectiveToolName === 'fetch_content') {
    return primaryBadge && primaryBadge.includes('URL')
      ? `Fetching ${primaryBadge.toLowerCase()}…`
      : 'Fetching content…';
  }

  return model.title;
}

export function ToolCallProgress({ tool }: { tool: ChatToolCallMessage }) {
  const model = buildToolProgressModel(tool);
  if (!model) return null;

  const Icon = model.icon;
  const showRawText = model.rawText && model.rawText !== model.title && model.rawText !== model.subtitle;
  const progressWidth = model.indeterminate
    ? '100%'
    : `${clampProgress(model.progressPct ?? 0)}%`;

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-status-info" />
        <span className="truncate text-xs font-medium text-[var(--text-primary)]">
          {model.title}
        </span>
        {model.badges.length > 0 ? (
          <span className="ml-auto shrink-0 text-xs text-status-info">
            {model.badges.join(' \u00b7 ')}
          </span>
        ) : null}
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]/70">
        <div
          className={cn(
            'h-full rounded-full bg-status-info transition-[width] duration-300',
            model.indeterminate && 'animate-pulse opacity-60',
          )}
          style={{ width: progressWidth }}
        />
      </div>

      {model.subtitle ? (
        <p className="break-words text-xs text-[var(--text-secondary)]">{model.subtitle}</p>
      ) : null}

      {showRawText ? (
        <p className="break-words text-xs text-[var(--text-muted)]">{model.rawText}</p>
      ) : null}
    </div>
  );
}
