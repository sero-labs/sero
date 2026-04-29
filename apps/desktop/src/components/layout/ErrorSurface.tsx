import { AlertCircle, RotateCcw, X } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { cn } from '@sero-ai/ui/lib/utils';
import { IconAction } from '@/components/ui/IconAction';

interface ErrorSurfaceProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorSurface({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Retry',
  onDismiss,
  className,
}: ErrorSurfaceProps) {
  return (
    <Alert
      variant="destructive"
      className={cn(
        'border-[var(--status-error-border)] bg-[var(--status-error-muted)] text-[var(--status-error)]',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--status-error)]" />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <AlertTitle className="text-[var(--status-error)]">{title}</AlertTitle>
            <AlertDescription className="break-words text-[var(--status-error)]/90">
              {message}
            </AlertDescription>
          </div>
          {onDismiss ? (
            <IconAction
              as="span"
              role="button"
              tabIndex={0}
              onClick={onDismiss}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onDismiss();
                }
              }}
              className="-mr-1 -mt-1 rounded-md text-[var(--status-error)] hover:bg-[var(--status-error-subtle)]"
              title="Dismiss"
            >
              <X className="size-3.5" />
            </IconAction>
          ) : null}
        </div>

        {onRetry ? (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="h-7 gap-1.5 border-[var(--status-error-border)] bg-transparent px-2.5 text-xs text-[var(--status-error)] hover:bg-[var(--status-error-subtle)] hover:text-[var(--status-error)]"
            >
              <RotateCcw className="size-3" />
              {retryLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </Alert>
  );
}
