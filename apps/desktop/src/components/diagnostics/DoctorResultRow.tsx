import { useState } from 'react';
import type { DoctorResult, DoctorStatus } from '@/types/ipc';

const STATUS_GLYPH: Record<DoctorStatus, string> = {
  pass: '✓',
  warn: '⚠',
  fail: '✗',
};

const STATUS_COLOUR: Record<DoctorStatus, string> = {
  pass: 'text-emerald-600',
  warn: 'text-amber-600',
  fail: 'text-rose-600',
};

interface Props {
  result: DoctorResult;
  onCopyFix?: (fix: string) => void;
}

function fixDescription(result: DoctorResult): string | null {
  if (!result.fix) return null;
  if (result.fix.kind === 'manual') return result.fix.instructions;
  if (result.fix.kind === 'command') {
    return `${result.fix.command} ${result.fix.args.join(' ')}`.trimEnd();
  }
  return result.fix.description;
}

export function DoctorResultRow({ result, onCopyFix }: Props) {
  const [expanded, setExpanded] = useState(false);
  const fix = fixDescription(result);
  const isCommand = result.fix?.kind === 'command';
  const isRepair = result.fix?.kind === 'repair';

  return (
    <li className="border-b last:border-b-0 border-border/50 py-1.5">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-start gap-2 w-full text-left"
      >
        <span className={`mt-0.5 font-mono ${STATUS_COLOUR[result.status]}`}>
          {STATUS_GLYPH[result.status]}
        </span>
        <span className="flex-1 text-base">{result.message}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {result.durationMs}ms
        </span>
      </button>
      {expanded && (
        <div className="ml-6 mt-1 space-y-1">
          <div className="text-xs text-muted-foreground font-mono">{result.id}</div>
          {fix && (
            <div className="text-xs">
              <span className="text-muted-foreground">Fix:</span> {fix}
              {isCommand && onCopyFix && (
                <button
                  type="button"
                  className="ml-2 text-xs text-primary underline"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCopyFix(fix);
                  }}
                >
                  Copy
                </button>
              )}
              {isRepair && (
                <span className="ml-2 inline-block rounded bg-muted px-1 text-xs text-muted-foreground">
                  Auto-repair coming soon
                </span>
              )}
            </div>
          )}
          {result.details && Object.keys(result.details).length > 0 && (
            <pre className="text-xs bg-muted rounded p-1 overflow-x-auto">
              {JSON.stringify(result.details, null, 2)}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
