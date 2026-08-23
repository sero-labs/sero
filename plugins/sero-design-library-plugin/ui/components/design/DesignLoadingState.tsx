import { Spinner } from '@sero-ai/ui/components/ui/spinner';

/** Visible progress over the design itself, including while revising a preview. */
export function DesignLoadingState({ message }: { message: string }) {
  return (
    <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm">
      <div
        role="status"
        aria-live="polite"
        className="border-border bg-background flex items-center gap-3 rounded-md border px-4 py-3 shadow-sm"
      >
        <Spinner
          role="presentation"
          aria-hidden
          className="text-primary size-4 motion-reduce:animate-none"
        />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}
