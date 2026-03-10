/**
 * EmptyState — shown when service is stopped or no sessions running.
 */

interface EmptyStateProps {
  serviceActive: boolean;
}

export function EmptyState({ serviceActive }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center sy-animate-in">
      <div className="sy-empty-orb mb-5" />
      <h2
        className="text-lg"
        style={{ color: 'var(--sy-text)', fontWeight: 500 }}
      >
        {serviceActive ? 'Waiting for issues' : 'Symphony is idle'}
      </h2>
      <p
        className="mt-2 max-w-[280px] text-sm leading-relaxed"
        style={{ color: 'var(--sy-muted)' }}
      >
        {serviceActive
          ? 'The orchestrator is polling for new issues. Sessions will appear here when dispatched.'
          : 'Place a WORKFLOW.md in your workspace and start the service to begin orchestrating.'}
      </p>
    </div>
  );
}
