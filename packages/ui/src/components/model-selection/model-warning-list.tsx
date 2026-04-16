import { TriangleAlert } from 'lucide-react';
import { formatModelValidationWarning, type ModelValidationWarning } from '@sero/common';
import { cn } from '../../lib/utils';

interface ModelWarningListProps {
  warnings: ModelValidationWarning[];
  className?: string;
}

export function ModelWarningList({ warnings, className }: ModelWarningListProps) {
  if (warnings.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {warnings.map((warning, index) => (
        <div
          key={`${warning.code}:${index}`}
          className={cn(
            'rounded-lg border px-3 py-2 text-xs',
            warning.severity === 'info'
              ? 'border-primary/20 bg-primary/5 text-primary'
              : 'border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300',
          )}
        >
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{formatModelValidationWarning(warning)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
