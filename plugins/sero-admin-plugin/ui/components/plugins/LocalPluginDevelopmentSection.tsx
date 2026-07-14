import { memo } from 'react';
import { Code2, Loader2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { PluginDevSessionIPC } from '../../hooks/host';
import { PluginDevSessionCard } from './PluginDevSessionCard';
import { PluginSection, SectionHeader } from './section-ui';

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
  const refreshingSessionIds = new Set(refreshingIds);
  const stoppingSessionIds = new Set(stoppingIds);

  return (
    <PluginSection>
      <SectionHeader
        icon={Code2}
        title="Local Plugin Development"
        description="Run a local plugin checkout for the active profile. Dev sessions do not create installed plugins; attach the folder below only when you want it visible in Explorer."
        action={
          <Button
            size="sm"
            className="h-8 text-sm"
            onClick={() => {
              void onStart();
            }}
            disabled={starting}
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
        }
      />

      <div className="space-y-4 p-4">
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="admin-loading rounded-lg border border-border/40 bg-background/40 px-4 py-6 text-center text-xs text-muted-foreground">
            Loading local plugin development sessions…
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-3">
            {sessions.map((session) => (
              <PluginDevSessionCard
                key={session.sessionId}
                session={session}
                refreshing={refreshingSessionIds.has(session.sessionId)}
                stopping={stoppingSessionIds.has(session.sessionId)}
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
    </PluginSection>
  );
});

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 bg-background/30 px-6 py-9 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Code2 className="size-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">No local development sessions yet</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
        Choose a local plugin checkout to create a profile-scoped dev session. Sero validates it
        before activation and will not turn it into an installed plugin.
      </p>
    </div>
  );
}
