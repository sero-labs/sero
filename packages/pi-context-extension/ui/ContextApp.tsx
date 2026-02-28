/**
 * ContextApp — Sero web UI for the context management extension.
 *
 * Visualises the agent's context graph (tags, branches, HEAD),
 * token usage breakdown, and includes a quick-reference guide
 * to the context management workflow.
 */

import { useCallback, useRef, useEffect } from 'react';
import { useAppState, useAgentPrompt } from '@sero/app-runtime';
import { Button } from '@sero/ui/components/ui/button';
import { Separator } from '@sero/ui/components/ui/separator';
import { ScrollArea } from '@sero/ui/components/ui/scroll-area';
import type { ContextState } from '../shared/types';
import { DEFAULT_CONTEXT_STATE } from '../shared/types';
import { UsageDashboard } from './components/UsageDashboard';
import { ContextTimeline } from './components/ContextTimeline';
import { QuickReference } from './components/QuickReference';
import './styles.css';

export function ContextApp() {
  const [state] = useAppState<ContextState>(DEFAULT_CONTEXT_STATE);
  const prompt = useAgentPrompt();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const refreshGraph = useCallback(() => {
    prompt('Use the context_log tool to refresh the context state.');
  }, [prompt]);

  const createTag = useCallback(
    (name: string) => {
      prompt(`Use context_tag to create a tag named "${name}".`);
    },
    [prompt],
  );

  const checkoutTarget = useCallback(
    (target: string) => {
      prompt(
        `Use context_checkout to navigate to "${target}". Provide a detailed carryover message summarising the current state.`,
      );
    },
    [prompt],
  );

  const hasData = state.nodes.length > 0;
  const lastUpdated = state.lastUpdated
    ? new Date(state.lastUpdated).toLocaleTimeString()
    : null;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="flex h-full w-full flex-col overflow-hidden bg-background outline-none"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-foreground">Context</h1>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdated}
            </span>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={refreshGraph}>
          Refresh
        </Button>
      </div>

      {/* Body */}
      {!hasData ? (
        <EmptyState onRefresh={refreshGraph} />
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-4 p-5">
            {/* Usage Dashboard */}
            <UsageDashboard usage={state.usage} stepsSinceTag={state.stepsSinceTag} nearestTag={state.nearestTag} totalEntries={state.totalEntries} />

            <Separator />

            {/* Context Graph */}
            <ContextTimeline
              nodes={state.nodes}
              onCheckout={checkoutTarget}
              onTag={createTag}
            />

            <Separator />

            {/* Quick Reference */}
            <QuickReference />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
        <span className="text-2xl">🌿</span>
      </div>
      <div className="text-center">
        <h2 className="text-sm font-medium text-foreground">
          No context data yet
        </h2>
        <p className="mt-1 max-w-[280px] text-xs leading-relaxed text-muted-foreground">
          Start a conversation with the agent, then click Refresh to visualise the
          context graph. The agent can also use <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">context_tag</code>, <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">context_log</code>, and <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">context_checkout</code> to
          manage its own context.
        </p>
      </div>
      <Button size="sm" variant="secondary" onClick={onRefresh}>
        Refresh
      </Button>
    </div>
  );
}

export default ContextApp;
