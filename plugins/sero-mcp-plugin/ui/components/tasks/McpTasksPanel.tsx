import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, Ban, Check, ListChecks, Loader2, MessageCircleQuestion, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { ACTIVE_TASK_STATUSES, type McpTaskSummary } from '../../../shared/tasks';

const STATUS: Record<McpTaskSummary['status'], { label: string; tone: string; icon: typeof Check }> = {
  working: { label: 'Working', tone: 'text-sky-400', icon: Loader2 },
  input_required: { label: 'Waiting for your answer', tone: 'text-sky-400', icon: MessageCircleQuestion },
  completed: { label: 'Completed', tone: 'text-emerald-400', icon: Check },
  failed: { label: 'Failed', tone: 'text-red-400', icon: X },
  cancelled: { label: 'Cancelled', tone: 'text-muted-foreground', icon: Ban },
  disconnected: { label: 'Disconnected', tone: 'text-amber-400', icon: TriangleAlert },
  'blocked-principal': { label: 'Cannot continue', tone: 'text-red-400', icon: AlertCircle },
};

export interface McpTasksPanelProps {
  tasks: McpTaskSummary[];
  error?: string | null;
  onCancel: (taskId: string) => void;
  onDismiss: (taskId: string) => void;
  now?: number;
}

/** The tasks that MCP servers run for Sero, as the approved prototype shows them: one card, one row per task. */
export function McpTasksPanel({ tasks, error, onCancel, onDismiss, now = Date.now() }: McpTasksPanelProps) {
  const [openResults, setOpenResults] = useState<ReadonlySet<string>>(new Set());
  const toggleResult = (taskId: string) => setOpenResults((current) => {
    const next = new Set(current);
    if (!next.delete(taskId)) next.add(taskId);
    return next;
  });

  return (
    <Card className="border-border/75 py-4" aria-labelledby="mcp-tasks-title">
      <CardHeader>
        <CardTitle id="mcp-tasks-title" className="flex items-center gap-2 text-base">
          <ListChecks className="size-4 text-primary" />
          Tasks
          <span className="text-sm font-normal text-muted-foreground">{tasks.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-2 text-sm text-red-400" role="alert">{error}</p>}
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks.</p>
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((task) => {
              const status = STATUS[task.status];
              const Icon = status.icon;
              const active = ACTIVE_TASK_STATUSES.has(task.status);
              const note = task.status === 'disconnected' || task.status === 'blocked-principal' ? task.lastError : task.statusMessage;
              const hasResult = (task.status === 'completed' || task.status === 'failed') && task.resultText;
              const resultOpen = openResults.has(task.taskId);
              return (
                <li key={task.taskId} className="flex items-start gap-3 py-2.5">
                  <Icon className={cn('mt-0.5 size-4 shrink-0', status.tone, task.status === 'working' && 'animate-spin')} aria-hidden />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm">
                      <span className="text-muted-foreground">{task.serverName} · </span>{task.toolName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className={status.tone}>{status.label}</span> · {formatAge(task.createdAt, now)} ago
                    </p>
                    {note && <p className="text-xs text-muted-foreground">{note}</p>}
                    {hasResult && resultOpen && (
                      <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs">{task.resultText}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {active && (
                      <Button size="sm" variant="outline" onClick={() => onCancel(task.taskId)} aria-label={`Cancel ${task.serverName} · ${task.toolName}`}>
                        Cancel
                      </Button>
                    )}
                    {hasResult && (
                      <Button size="sm" variant="outline" onClick={() => toggleResult(task.taskId)} aria-expanded={resultOpen}>
                        {resultOpen ? 'Hide result' : 'Result'}
                      </Button>
                    )}
                    {!active && (
                      <Button size="sm" variant="ghost" onClick={() => onDismiss(task.taskId)} aria-label={`Dismiss ${task.serverName} · ${task.toolName}`}>
                        Dismiss
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function formatAge(createdAt: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(createdAt)) / 60_000));
  if (minutes < 1) return 'less than 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}
