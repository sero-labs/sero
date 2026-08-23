import { Button } from '@sero-ai/ui/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sero-ai/ui/components/ui/tabs';
import {
  FileCode,
  History,
  Image as ImageIcon,
  Layers,
  RotateCw,
  SlidersHorizontal,
  Square,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { DesignBrief, DesignRevision } from '../../../shared/design';
import type { DesignAsset } from '../../../shared/media';
import type { DesignVariantSummary } from '../../../shared/types';
import type { TweakSurface } from '../../hooks/useTweaks';
import { AssetsTab } from './inspector/AssetsTab';
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

type TabId = 'design' | 'files' | 'history' | 'tweaks' | 'art';

const TABS: { id: TabId; label: string; icon: typeof Layers }[] = [
  { id: 'design', label: 'Design', icon: Layers },
  { id: 'files', label: 'Files', icon: FileCode },
  { id: 'history', label: 'History', icon: History },
  { id: 'tweaks', label: 'Tweaks', icon: SlidersHorizontal },
  { id: 'art', label: 'Art', icon: ImageIcon },
];

export interface VariantInspectorProps {
  variant: DesignVariantSummary;
  /** The visible revision, or undefined until one has been produced. */
  revision: DesignRevision | undefined;
  revisions: DesignRevision[];
  brief: DesignBrief | undefined;
  references: DesignReferenceView[];
  ownReferenceId: string | undefined;
  tweaks: TweakSurface;
  /** The Design's assets — they belong to the Design, not to this variant. */
  designId: string;
  assets: DesignAsset[];
  onRetry(): void;
  onCancel(): void;
  onSelectRevision(revisionId: string): void;
  onOpenFiles?: () => void;
  onRetryAsset(assetId: string): void;
  onCopyAssetToLibrary(assetId: string): void;
  onDeleteAsset(assetId: string): void;
  onGenerateAsset(): void;
  onRemixAsset(assetId: string): void;
}

export function VariantInspector({
  variant,
  revision,
  revisions,
  brief,
  references,
  ownReferenceId,
  tweaks,
  designId,
  assets,
  onRetry,
  onCancel,
  onSelectRevision,
  onOpenFiles,
  onRetryAsset,
  onCopyAssetToLibrary,
  onDeleteAsset,
  onGenerateAsset,
  onRemixAsset,
}: VariantInspectorProps) {
  const [tab, setTab] = useState<TabId>('design');
  const running = variant.status === 'pending' || variant.status === 'running';
  const controlCount = tweaks.manifest.controls.length;

  // Leaving the Tweaks tab ends an editing session (spec §6.5). The panel
  // closing is one of the moments a session checkpoints at, and the session
  // ending is the difference between one recoverable entry and fifty.
  //
  // Through a ref, because the tab can stay open across a change of revision —
  // a revise landing, or another Design chosen from the rail. A cleanup holding
  // the surface from the render the tab last changed on would close a session on
  // the revision the user has left and leave the one they are on open.
  const checkpoint = useRef(tweaks.checkpoint);
  useEffect(() => {
    checkpoint.current = tweaks.checkpoint;
  });

  useEffect(() => {
    if (tab === 'tweaks') {
      return () => {
        void checkpoint.current();
      };
    }
    return undefined;
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

          {(running || variant.status === 'failed' || variant.status === 'cancelled') && (
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
                  aria-label="Try again"
                  title="Generate this variant again"
                  onClick={onRetry}
                >
                  <RotateCw className="size-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as TabId)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        {/* A fifth tab does not fit five labels at the inspector's 280px
            minimum — "History" and "Tweaks" collide. The row measures itself
            rather than the viewport, because the panel is drag-resizable and
            the window's width says nothing about it: when it gets tight the
            labels give way to icons, and the label stays as the accessible
            name so nothing is lost to a screen reader. */}
        <TabsList variant="line" className="@container mx-3 mt-2 grid w-auto grid-cols-5">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="data-[state=active]:text-primary dark:data-[state=active]:text-primary after:bg-primary"
              aria-label={tab.label}
              title={tab.label}
            >
              <tab.icon className="size-3.5 @[280px]:hidden" />
              <span className="hidden @[280px]:inline">{tab.label}</span>
              {tab.id === 'tweaks' && controlCount > 0 && (
                <span className="text-muted-foreground tabular-nums">{controlCount}</span>
              )}
              {tab.id === 'art' && assets.length > 0 && (
                <span className="text-muted-foreground tabular-nums">{assets.length}</span>
              )}
            </TabsTrigger>
          ))}
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
          <FilesTab files={revision?.files ?? []} {...(onOpenFiles === undefined ? {} : { onOpen: onOpenFiles })} />
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

        <TabsContent value="art" className="mt-2 flex min-h-0 flex-1 flex-col">
          <AssetsTab
            designId={designId}
            assets={assets}
            onRetry={onRetryAsset}
            onCopyToLibrary={onCopyAssetToLibrary}
            onDelete={onDeleteAsset}
            onGenerate={onGenerateAsset}
            onRemix={onRemixAsset}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
