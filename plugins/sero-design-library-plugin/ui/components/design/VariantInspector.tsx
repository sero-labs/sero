import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@sero-ai/ui';
import { RotateCw, Square } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { DesignBrief, DesignRevision } from '../../../shared/design';
import type { DesignVariantSummary } from '../../../shared/types';
import type { TweakSurface } from '../../hooks/useTweaks';
import { DesignTab } from './inspector/DesignTab';
import { FilesTab } from './inspector/FilesTab';
import { HistoryTab } from './inspector/HistoryTab';
import type { DesignReferenceView } from './references';
import { TweaksPanel } from './TweaksPanel';

/**
 * The panel beside the work: what the run produced, what it is made of, what it
 * has been, and what can still be changed about it (spec §6.5).
 *
 * Built to the reference inspector's pattern — same flush left border, same
 * header, same field styling — because they are the same kind of panel. Tweaks
 * is a fourth tab here rather than new chrome elsewhere, so a control-heavy
 * design costs the surface nothing when you are not adjusting it.
 */

type TabId = 'design' | 'files' | 'history' | 'tweaks';

export interface VariantInspectorProps {
  variant: DesignVariantSummary;
  /** The visible revision, or undefined until one has been produced. */
  revision: DesignRevision | undefined;
  revisions: DesignRevision[];
  brief: DesignBrief | undefined;
  references: DesignReferenceView[];
  ownReferenceId: string | undefined;
  tweaks: TweakSurface;
  onRetry(): void;
  onCancel(): void;
  onSelectRevision(revisionId: string): void;
}

export function VariantInspector({
  variant,
  revision,
  revisions,
  brief,
  references,
  ownReferenceId,
  tweaks,
  onRetry,
  onCancel,
  onSelectRevision,
}: VariantInspectorProps) {
  const [tab, setTab] = useState<TabId>('design');
  const running = variant.status === 'pending' || variant.status === 'running';
  const controlCount = tweaks.manifest.controls.length;

  // Leaving the Tweaks tab ends an editing session (spec §6.5). The panel
  // closing is one of the moments a session checkpoints at, and the session
  // ending is the difference between one recoverable entry and fifty.
  useEffect(() => {
    if (tab === 'tweaks') return () => tweaks.checkpoint();
    return undefined;
    // The surface is rebuilt on every render; checkpointing is keyed to the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const context = [
    brief === undefined ? '' : brief.target === 'html' ? 'Web prototype' : 'React component',
    brief === undefined ? '' : `${brief.inspirationStrength} influence`,
    variant.revisionCount > 1 ? `${variant.revisionCount} revisions` : '',
  ].filter((part) => part !== '');

  return (
    <div className="border-border flex h-full min-h-0 w-full flex-col border-l">
      <header className="border-border border-b px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-primary text-xs font-medium tracking-wide uppercase">
              Variant {String(variant.index + 1).padStart(2, '0')} · {variant.status}
            </p>
            <h3 className="mt-1 truncate text-lg font-semibold">{variant.name ?? 'Unnamed'}</h3>
            {context.length > 0 && (
              <p className="text-muted-foreground mt-0.5 truncate text-sm">{context.join(' · ')}</p>
            )}
          </div>

          {/* Beside the title, where the reference panel keeps its actions. */}
          <div className="flex shrink-0 items-center">
            {running ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Stop generating"
                title="Stop generating this variant"
                onClick={onCancel}
              >
                <Square className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={variant.status === 'ready'}
                aria-label="Try again"
                title="Generate this variant again"
                onClick={onRetry}
              >
                <RotateCw className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as TabId)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList className="mx-3 mt-2 grid w-auto grid-cols-4">
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="tweaks">
            Tweaks
            {controlCount > 0 && (
              <span className="text-muted-foreground tabular-nums">{controlCount}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="design" className="mt-2 flex min-h-0 flex-1 flex-col">
          <DesignTab
            summary={revision?.summary ?? ''}
            error={variant.error}
            references={references}
            ownReferenceId={ownReferenceId}
          />
        </TabsContent>

        <TabsContent value="files" className="mt-2 flex min-h-0 flex-1 flex-col">
          <FilesTab files={revision?.files ?? []} />
        </TabsContent>

        <TabsContent value="history" className="mt-2 flex min-h-0 flex-1 flex-col">
          <HistoryTab
            revisions={revisions}
            visibleRevisionId={revision?.id}
            checkpoints={revision?.tweaks?.checkpoints ?? []}
            onSelectRevision={onSelectRevision}
            onRestoreCheckpoint={tweaks.restoreCheckpoint}
          />
        </TabsContent>

        <TabsContent value="tweaks" className="mt-2 flex min-h-0 flex-1 flex-col">
          <TweaksPanel tweaks={tweaks} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
