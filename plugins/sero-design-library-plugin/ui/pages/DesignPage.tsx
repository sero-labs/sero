import {
  Button,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@sero-ai/ui';
import { createDebouncedFn } from '@sero-ai/common';
import { ArrowLeft, Images, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DesignRecord } from '../../shared/design';
import { orderedRevisions } from '../../shared/design';
import type { MediaCapability, MediaModelOptions } from '../../shared/media';
import { assetIsReady, currentAttempt } from '../../shared/media';
import type { DesignLibrarySettings, RevisionBehaviour } from '../../shared/settings';
import type { DesignSummary, ItemSummary } from '../../shared/types';
import { GenerateDialog, type GenerateSource } from '../components/GenerateDialog';
import { PreviewFrame } from '../components/design/PreviewFrame';
import { ReviseBar } from '../components/design/ReviseBar';
import { SessionsRail } from '../components/design/SessionsRail';
import { VariantInspector } from '../components/design/VariantInspector';
import { VariantTabs } from '../components/design/VariantTabs';
import { referenceViews } from '../components/design/references';
import type { DesignActions } from '../hooks/useDesigns';
import { useMedia } from '../hooks/useMedia';
import { useGallery } from '../hooks/useGallery';
import { useVideoFrames } from '../hooks/useVideoFrames';
import { useTweaks } from '../hooks/useTweaks';
import type { PreviewTarget } from '../hooks/usePreviewDocument';
import { canShowItemInFolder } from '../lib/host-files';

/**
 * The Design surface: the Designs on the go down the left, variants across the
 * top, the live preview filling the middle, and the inspector beside it.
 *
 * The inspector is drag-resizable and its width persists (spec §6.5), because a
 * control-heavy design needs room the rest of the time does not. The rail
 * collapses for the same reason — the two together are what let a widened panel
 * cost nothing.
 */

/** Long enough that a drag is one write rather than one per frame. */
const LAYOUT_PERSIST_MS = 400;

export interface DesignPageProps {
  design: DesignSummary;
  /** Every live Design, for the rail. */
  designs: DesignSummary[];
  /** Live Library items, for naming the references this Design drew on. */
  items: ItemSummary[];
  settings: DesignLibrarySettings;
  /** What each capability's model accepts, for the generate dialog's pickers. */
  mediaOptions: Partial<Record<MediaCapability, MediaModelOptions>>;
  /** The persisted selection, so reopening a Design lands where you left it. */
  activeVariantId: string | undefined;
  actions: DesignActions;
  onBack(): void;
}

export function DesignPage({
  design,
  designs,
  items,
  settings,
  mediaOptions,
  activeVariantId,
  actions,
  onBack,
}: DesignPageProps) {
  const [record, setRecord] = useState<DesignRecord | null>(null);
  /**
   * The click, held locally so the tab responds before the write comes back. It
   * is stamped with the Design and with the selection it replaced, and it only
   * applies while both still hold — so it stops mattering the moment the write
   * lands or anything else moves the selection, rather than pinning this page to
   * one tab for as long as it stays open.
   */
  const [picked, setPicked] = useState<{
    designId: string;
    variantId: string;
    replacing: string | undefined;
  } | null>(null);
  /**
   * The inspector is out of the way for a moment. Deliberately not persisted:
   * it is a look at the page, not a layout preference — the persisted one is the
   * inspector's width.
   */
  const [focused, setFocused] = useState(false);
  const [generation, setGeneration] = useState<{ sourceId?: string } | null>(null);
  const [captureReady, setCaptureReady] = useState(false);
  const [startingGallerySave, setStartingGallerySave] = useState(false);
  const [gallerySaveError, setGallerySaveError] = useState<string>();
  const media = useMedia();
  const gallery = useGallery();
  const captureTarget = useRef<HTMLDivElement | null>(null);
  const registerCaptureTarget = useCallback((element: HTMLDivElement | null) => {
    captureTarget.current = element;
  }, []);

  // The record holds what the index deliberately leaves out — guardrails, file
  // lists, revisions, tweak values — so it is read on demand and re-read
  // whenever the Design changes underneath.
  useEffect(() => {
    let active = true;
    void actions.read(design.id).then((result) => {
      if (active) setRecord(result);
    });
    return () => {
      active = false;
    };
  }, [design.id, design.updatedAt, actions]);

  const pinned =
    picked?.designId === design.id && picked.replacing === activeVariantId
      ? picked.variantId
      : activeVariantId;
  const active = design.variants.find((variant) => variant.id === pinned) ?? design.variants[0];

  const activeRecord = record?.variants.find((variant) => variant.id === active?.id);
  const revision = activeRecord?.revisions.find(
    (entry) => entry.id === activeRecord.visibleRevisionId,
  );

  const tweaks = useTweaks(
    active === undefined || revision === undefined
      ? null
      : { designId: design.id, variantId: active.id, revisionId: revision.id },
    revision?.tweaks?.overrides ?? {},
    revision?.tweakManifestFile !== undefined,
  );

  const select = (variantId: string) => {
    // Moving to another variant ends the editing session on this one, which is
    // what keeps its changes to one recoverable entry (spec §6.5).
    tweaks.checkpoint();
    setPicked({ designId: design.id, variantId, replacing: activeVariantId });
    void actions.selectVariant(variantId);
  };

  const references = useMemo(
    () => referenceViews(design.referenceItemIds, items),
    [design.referenceItemIds, items],
  );

  const assets = useMemo(
    () => (record?.assets ?? []).filter((asset) => asset.deletedAt === undefined),
    [record],
  );

  // Only artwork that exists can be restyled or upscaled, and a Design's own
  // assets come first: within a Design that is the one just made.
  const assetSources = useMemo<GenerateSource[]>(
    () =>
      assets.flatMap((asset) =>
        assetIsReady(asset)
          ? [
              {
                id: asset.id,
                label: asset.request.prompt === '' ? asset.reference : asset.request.prompt,
                kind: asset.kind,
              },
            ]
          : [],
      ),
    [assets],
  );

  // A tray video with no poster is one the renderer has not looked at yet.
  const assetsAwaitingFrames = useMemo(
    () =>
      assets.flatMap((asset) => {
        const attempt = currentAttempt(asset);
        return asset.kind === 'video' &&
          attempt?.outcome === 'ready' &&
          attempt.posterFile === undefined
          ? [
              {
                kind: 'asset' as const,
                designId: design.id,
                assetId: asset.id,
                attemptId: attempt.id,
              },
            ]
          : [];
      }),
    [assets, design.id],
  );
  useVideoFrames(assetsAwaitingFrames);

  const persistWidth = useLayoutPersist(actions);

  const target: PreviewTarget | null =
    active && revision?.builtFile !== undefined
      ? {
          designId: design.id,
          variantId: active.id,
          revisionId: revision.id,
          fileName: revision.builtFile,
        }
      : null;

  const working = active?.status === 'running' || active?.status === 'pending';

  return (
    <div className="flex min-h-0 flex-1">
      <SessionsRail
        designs={designs}
        openDesignId={design.id}
        collapsed={settings.layout.sessionsRailCollapsed}
        onOpen={(designId) => void actions.open(designId)}
        onToggle={() =>
          void actions.setLayout({ sessionsRailCollapsed: !settings.layout.sessionsRailCollapsed })
        }
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="border-border flex items-center gap-3 border-b px-4 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            Library
          </Button>
          <h2 className="min-w-0 truncate text-sm font-semibold">{design.title}</h2>
          <span className="text-muted-foreground text-sm">{design.target}</span>

          <Button
            type="button"
            size="sm"
            className="ml-auto"
            disabled={working || revision === undefined || !captureReady || gallery.saving || startingGallerySave}
            onClick={() => {
              if (!active || !revision || !captureTarget.current) return;
              const target = captureTarget.current;
              setStartingGallerySave(true);
              setGallerySaveError(undefined);
              void tweaks.checkpoint().then(() =>
                gallery.actions.save(target, design.id, active.id, revision.id),
              ).catch(() => {
                setGallerySaveError('The latest Tweaks could not be saved, so Gallery did not capture them.');
              }).finally(() => setStartingGallerySave(false));
            }}
          >
            <Images className="size-3.5" />
            {gallery.saving || startingGallerySave ? 'Saving…' : 'Save to Gallery'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void actions.remove(design.id);
              onBack();
            }}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </header>

        <VariantTabs variants={design.variants} activeId={active?.id} onSelect={select} />

        {active === undefined ? (
          <p className="text-muted-foreground p-6 text-sm">This Design has no variants.</p>
        ) : (
          <>
            <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
              <ResizablePanel id="design-preview" minSize={320} className="min-w-0">
                <div className="flex h-full min-h-0 min-w-0 flex-col p-3">
                  <PreviewFrame
                    target={target}
                    buildWarnings={revision?.buildWarnings ?? []}
                    title={`${design.title} — ${active.name ?? `variant ${active.index + 1}`}`}
                    tweakValues={tweaks.cssValues}
                    focused={focused}
                    onFocus={() => setFocused((current) => !current)}
                    onCaptureTarget={registerCaptureTarget}
                    onCaptureReady={setCaptureReady}
                    {...(working
                      ? {
                          generationMessage:
                            active.progress ??
                            (active.status === 'pending'
                              ? 'Waiting to start…'
                              : 'Building your design…'),
                        }
                      : {})}
                  />
                </div>
              </ResizablePanel>

              {!focused && <ResizableHandle withHandle />}

              {/* The inspector sits flush against the edge under its own left
                  border, exactly as the reference inspector does; only the
                  preview is inset.

                  Hidden by unmounting rather than by collapsing to zero width:
                  the panel holds an editing session, and ending it when it goes
                  away is exactly what the checkpoint rule asks for. */}
              {!focused && (
              <ResizablePanel
                id="design-inspector"
                defaultSize={`${settings.layout.inspectorWidth}px`}
                minSize={280}
                maxSize={720}
                onResize={({ inPixels }) => persistWidth(Math.round(inPixels))}
              >
                <VariantInspector
                  variant={active}
                  revision={revision}
                  revisions={activeRecord === undefined ? [] : orderedRevisions(activeRecord)}
                  brief={record?.brief}
                  references={references}
                  ownReferenceId={active.referenceItemId}
                  tweaks={tweaks}
                  designId={design.id}
                  assets={assets}
                  onRetry={() => void actions.retryVariant(design.id, active.id)}
                  onCancel={() => void actions.cancelVariant(design.id, active.id)}
                  onSelectRevision={(revisionId) => {
                    tweaks.checkpoint();
                    void actions.showRevision(design.id, active.id, revisionId);
                  }}
                  {...(revision === undefined || !canShowItemInFolder()
                    ? {}
                    : {
                        onOpenFiles: () =>
                          void actions.openFiles(design.id, active.id, revision.id),
                      })}
                  onRetryAsset={(assetId) => void media.retry(design.id, assetId)}
                  onCopyAssetToLibrary={(assetId) => void media.copyToLibrary(design.id, assetId)}
                  onDeleteAsset={(assetId) => void media.remove(design.id, assetId)}
                  onGenerateAsset={() => setGeneration({})}
                  onRemixAsset={(sourceId) => setGeneration({ sourceId })}
                />
              </ResizablePanel>
              )}
            </ResizablePanelGroup>

            <ReviseBar
              disabled={working || revision === undefined}
              behaviour={settings.generation.revisionBehaviour}
              pending={activeRecord?.pendingRevision?.instruction}
              // Answering the question on the bar is also how it is remembered:
              // the choice is the generation default (spec §6.4).
              onBehaviour={(behaviour) => void actions.setRevisionBehaviour(behaviour)}
              onRevise={(instruction) => {
                // The session ends here too: the revise produces a new revision,
                // and the values belong to the one they were set on.
                tweaks.checkpoint();
                void actions.reviseVariant(
                  design.id,
                  active.id,
                  instruction,
                  settings.generation.revisionBehaviour,
                );
              }}
            />
            {(gallery.error ?? gallerySaveError) && (
              <p className="text-destructive px-4 pb-2 text-sm" role="alert">
                {gallery.error ?? gallerySaveError}
              </p>
            )}
          </>
        )}
      </div>

      <GenerateDialog
        key={generation?.sourceId ?? 'new'}
        open={generation !== null}
        target={{ kind: 'design', designId: design.id, designTitle: design.title }}
        sources={assetSources}
        modelOptions={mediaOptions}
        {...(generation?.sourceId === undefined ? {} : { initialSourceId: generation.sourceId })}
        onOpenChange={(open) => {
          if (!open) setGeneration(null);
        }}
        onGenerate={(request) => {
          // Nothing waits on the result: the asset is reserved immediately and
          // the tray paints whatever the record says about it from then on.
          void media.generate(design.id, request);
        }}
      />
    </div>
  );
}

/**
 * One write per drag rather than one per frame, through the same tool path.
 *
 * The debounced function is built once, on first use — `useRef(create(…))` would
 * build a new one on every render and throw it away, along with any write still
 * waiting in it. It reads the actions through a ref written in an effect, so a
 * render React discards cannot leave it calling into a stale surface.
 */
function useLayoutPersist(actions: DesignActions): (width: number) => void {
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  }, [actions]);

  const persist = useRef<((width: number) => void) | null>(null);
  persist.current ??= createDebouncedFn((width: number) => {
    void latest.current.setLayout({ inspectorWidth: width });
  }, LAYOUT_PERSIST_MS);
  return persist.current;
}
