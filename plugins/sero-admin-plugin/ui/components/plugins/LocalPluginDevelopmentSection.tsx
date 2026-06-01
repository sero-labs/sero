import { memo } from 'react';
import { Code2, Loader2 } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { PluginDevSessionIPC } from '../../hooks/host';
import { PluginDevSessionCard } from './PluginDevSessionCard';

interface LocalPluginDevelopmentSectionProps {
  sessions: PluginDevSessionIPC[];
  loading: boolean;
  error: string | null;
  starting: boolean;
  refreshingIds: string[];
  stoppingIds: string[];
  onStart: () => Promise<boolean>;
  onRefresh: (sessionId: string) => Promise<void>;
  onStop: (sessionId: string) => Promise<void>;
  onReveal: (sourcePath: string) => Promise<void>;
}

export const LocalPluginDevelopmentSection = memo(function LocalPluginDevelopmentSection({
  sessions,
  loading,
  error,
  starting,
  refreshingIds,
  stoppingIds,
  onStart,
  onRefresh,
  onStop,
  onReveal,
}: LocalPluginDevelopmentSectionProps) {
  const countLabel = sessions.length === 1 ? '1 session' : `${sessions.length} sessions`;

  return (
    <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_20px_60px_-42px_rgba(0,0,0,0.7)]">
      <div className="border-b border-[var(--border-subtle)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--status-info-border)] bg-[var(--status-info-muted)] text-[var(--status-info)]">
              <Code2 className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Local Plugin Development</h3>
                <Badge
                  variant="outline"
                  className="border-[var(--status-info-border)] bg-[var(--status-info-muted)] text-[10px] text-[var(--status-info)]"
                >
                  Profile scoped
                </Badge>
              </div>
              <p className="max-w-3xl text-[11px] leading-5 text-[var(--text-muted)]">
                Run a local plugin checkout directly for the active profile. Dev sessions do not
                create installed plugins, and attaching the folder to a workspace is optional when
                you want it visible in Explorer.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-[var(--status-info-border)] bg-[var(--status-info-muted)] text-[10px] text-[var(--status-info)]"
            >
              {countLabel}
            </Badge>
            <Button
              onClick={() => {
                void onStart();
              }}
              disabled={starting}
              className="h-9 bg-[var(--status-info)] px-3 text-xs font-medium text-white hover:bg-[var(--status-info)]/85"
            >
              {starting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Starting…
                </>
              ) : (
                'Start local development'
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-[var(--status-info-border)] bg-[var(--status-info-muted)]/40 px-3.5 py-3">
          <p className="text-[11px] leading-5 text-[var(--text-secondary)]">
            These sessions are saved per profile and use the source checkout directly. Use the{' '}
            <span className="font-medium text-[var(--text-primary)]">Attached folders</span>{' '}
            section below only when you also want the checkout mounted into the current workspace
            for Explorer visibility and agent editing.
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-[var(--status-error-border)] bg-[var(--status-error-faint)] px-3 py-2.5 text-[11px] text-[var(--status-error)]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
            Loading local plugin development sessions…
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 26rem), 1fr))' }}
          >
            {sessions.map((session) => (
              <PluginDevSessionCard
                key={session.sessionId}
                session={session}
                refreshing={refreshingIds.includes(session.sessionId)}
                stopping={stoppingIds.includes(session.sessionId)}
                onRefresh={() => {
                  void onRefresh(session.sessionId);
                }}
                onStop={() => {
                  void onStop(session.sessionId);
                }}
                onReveal={() => {
                  void onReveal(session.sourcePath);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-base)] px-6 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-[var(--status-info-border)] bg-[var(--status-info-muted)] text-[var(--status-info)]">
        <Code2 className="size-6" />
      </div>
      <p className="mt-4 text-sm font-medium text-[var(--text-primary)]">No local development sessions yet</p>
      <p className="mt-2 max-w-md text-[11px] leading-5 text-[var(--text-muted)]">
        Choose a local plugin checkout to create a profile-scoped dev session. Sero will validate
        it before activation and will not turn it into an installed plugin.
      </p>
    </div>
  );
}
