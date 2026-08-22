import { cn } from '@sero-ai/ui/lib/utils';
import { ClampedText } from './ClampedText';

const INLINE_VALUE_LIMIT = 120;

/** Short single-line values read better on one row than in a code block. */
function isInlineValue(value: unknown): value is string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  return typeof value === 'string' && value.length <= INLINE_VALUE_LIMIT && !value.includes('\n');
}

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** Tool arguments as key/value rows. The keys are the labels. */
export function ToolInputRows({ input }: { input: Record<string, unknown> }) {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return null;

  return (
    <dl className="min-w-0 space-y-1.5">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className={cn(
            'min-w-0',
            isInlineValue(value) ? 'grid grid-cols-[minmax(0,6rem)_1fr] gap-3' : 'space-y-1',
          )}
        >
          <dt className="truncate font-mono text-sm text-[var(--text-muted)]">{key}</dt>
          <dd className="min-w-0">
            {isInlineValue(value) ? (
              <span className="break-all font-mono text-sm text-[var(--text-secondary)]">
                {String(value)}
              </span>
            ) : (
              <ClampedText text={formatValue(value)} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
