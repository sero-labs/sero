/**
 * LogViewer — displays Sero log files with auto-refresh.
 *
 * Lists known log files (electron, vite, remotes) on the left,
 * shows the selected log's tail on the right with auto-scroll.
 * Large logs are capped at MAX_DISPLAY_LINES to avoid jank.
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { Button } from '@sero-ai/ui/components/ui/button';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { getSero } from '../hooks/host';

/** Max lines rendered. Logs beyond this show only the tail. */
const MAX_DISPLAY_LINES = 5000;

// ── Types ──────────────────────────────────────────────────

interface LogEntry {
  key: string;
  label: string;
  path: string;
}

const KNOWN_LOGS: LogEntry[] = [
  { key: 'electron', label: 'Electron', path: '/tmp/sero-electron.log' },
  { key: 'vite', label: 'Vite Host', path: '/tmp/sero-vite.log' },
];

// ── LogViewer ──────────────────────────────────────────────

export const LogViewer = memo(function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>(KNOWN_LOGS);
  const [selectedKey, setSelectedKey] = useState<string>('electron');
  const [discovering, setDiscovering] = useState(true);

  // Discover remote logs from app discovery API
  useEffect(() => {
    const discover = async () => {
      try {
        const sero = getSero();
        const apps = await sero.apps.discover();

        const remoteLogs: LogEntry[] = apps
          .map((app) => app.id)
          .sort()
          .map((name) => ({
            key: `remote-${name}`,
            label: `Remote: ${name}`,
            path: `/tmp/sero-remote-${name}.log`,
          }));

        setLogs([...KNOWN_LOGS, ...remoteLogs]);
      } catch {
        // Discovery failed — keep known logs only
      } finally {
        setDiscovering(false);
      }
    };
    discover();
  }, []);

  const selectedLog = logs.find((l) => l.key === selectedKey) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      <LogSidebar
        logs={logs}
        selectedKey={selectedKey}
        discovering={discovering}
        onSelect={setSelectedKey}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div key={selectedKey} className="admin-fade-in h-full">
          {selectedLog ? (
            <LogContent log={selectedLog} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-xs text-muted-foreground/50">Select a log file</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Log sidebar ────────────────────────────────────────────

const LogSidebar = memo(function LogSidebar({
  logs,
  selectedKey,
  discovering,
  onSelect,
}: {
  logs: LogEntry[];
  selectedKey: string;
  discovering: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex w-56 flex-col border-r border-border/30">
      <div className="flex items-center gap-2 px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
          Log Files
        </p>
        {discovering && (
          <span className="admin-loading text-[9px] text-muted-foreground/30">…</span>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {logs.map((log) => (
          <button type="button"
            key={log.key}
            onClick={() => onSelect(log.key)}
            className={cn(
              'admin-sidebar-item w-full border-l-2 border-l-transparent px-3 py-2 text-left transition-colors duration-150',
              'hover:bg-secondary/50',
              log.key === selectedKey && 'border-l-primary bg-secondary',
            )}
          >
            <span className={cn(
              'text-xs font-medium',
              log.key === selectedKey ? 'text-foreground' : 'text-foreground/80',
            )}>
              {log.label}
            </span>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/40">
              {log.path}
            </p>
          </button>
        ))}
      </ScrollArea>
    </div>
  );
});

// ── Log content viewer ─────────────────────────────────────

function LogContent({ log }: { log: LogEntry }) {
  const [lines, setLines] = useState<string[]>([]);
  const [totalLines, setTotalLines] = useState(0);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLog = useCallback(async () => {
    try {
      const sero = getSero();
      const text = await sero.appState.readText(log.path);
      if (text === null) {
        setLines([]);
        setTotalLines(0);
        setError('File not found');
      } else {
        const allLines = text.split('\n');
        setTotalLines(allLines.length);
        // Cap displayed lines to avoid jank on large logs
        setLines(allLines.slice(-MAX_DISPLAY_LINES));
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read log');
      setLines([]);
      setTotalLines(0);
    } finally {
      setLoading(false);
    }
  }, [log.path]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    loadLog();
  }, [loadLog]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(loadLog, 3000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoRefresh, loadLog]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const handleReveal = useCallback(async () => {
    try {
      const sero = getSero();
      await sero.shell.showItemInFolder(log.path);
    } catch {
      // Ignore
    }
  }, [log.path]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="admin-loading text-xs text-muted-foreground">Loading…</div>
      </div>
    );
  }

  // Line numbers offset when truncated
  const lineOffset = totalLines - lines.length;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground/80">{log.label}</span>
          <span className="font-mono text-[10px] text-muted-foreground/40">{log.path}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-6 px-2 text-[11px]',
              autoRefresh ? 'text-primary' : 'text-muted-foreground',
            )}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={cn('size-3', autoRefresh && 'animate-spin')} />
            Auto
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground"
            onClick={loadLog}
          >
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground"
            onClick={handleReveal}
          >
            Reveal
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-1.5">
          <p className="text-[11px] text-destructive">{error}</p>
        </div>
      )}

      {/* Truncation notice */}
      {lineOffset > 0 && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-1">
          <p className="text-[10px] text-amber-400/70">
            Showing last {MAX_DISPLAY_LINES.toLocaleString()} of {totalLines.toLocaleString()} lines
          </p>
        </div>
      )}

      {/* Log lines */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-2 font-mono text-[11px] leading-[1.6]">
          {lines.length === 0 ? (
            <p className="italic text-muted-foreground/40">Empty log</p>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="admin-log-line flex gap-2 rounded px-1 py-px">
                <span className="w-8 shrink-0 select-none text-right text-muted-foreground/30">
                  {lineOffset + i + 1}
                </span>
                <span className={cn(
                  'flex-1 break-all',
                  line.toLowerCase().includes('error') ? 'text-destructive/80' :
                  line.toLowerCase().includes('warn') ? 'text-amber-400/70' :
                  'text-foreground/70',
                )}>
                  {line || '\u00A0'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border/30 px-4 py-1.5">
        <p className="text-[10px] text-muted-foreground/40">
          {totalLines} lines
          {autoRefresh && (
            <span className="ml-2 inline-flex items-center gap-1 text-primary/50">
              <RefreshCw className="size-3 animate-spin" />
              Refreshing every 3s
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
