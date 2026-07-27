/**
 * Design — the generation, revision and tuning workbench.
 *
 * Tweak edits apply to the preview immediately, autosave continuously and are
 * checkpointed into one recoverable revision when the panel closes or the
 * active variant changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Input, ToggleGroup, ToggleGroupItem, cn } from '@sero-ai/ui';
import { AlertTriangle, LoaderCircle, Save, Wand2 } from 'lucide-react';
import type { DesignSummary, JobSummary } from '../../shared/state';
import type { RevisionBehaviour } from '../../shared/types';
import type { TweakManifest, TweakValue } from '../../shared/tweak-types';
import type { DroppedTweakControl } from '../../shared/tweak-types';
import { PreviewFrame } from '../components/PreviewFrame';
import { TweaksPanel } from '../components/TweaksPanel';
import { SurfaceState } from '../components/SurfaceState';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';
import type { DesignLibraryActions } from '../runtime';

interface VariantView {
  id: string;
  title: string;
  status: string;
  errorMessage?: string;
  visibleRevisionId?: string;
  revisionCount: number;
}

interface DesignView {
  id: string;
  title: string;
  request: string;
  outputTarget: 'html' | 'react-tailwind';
  variants: VariantView[];
  conflicts: Array<{ always: string; never: string; resolvedAt?: number }>;
  assets: Array<{ id: string; title: string; status: string }>;
}

export interface DesignPageProps {
  designs: DesignSummary[];
  jobs: JobSummary[];
  activeDesignId?: string;
  activeVariantId?: string;
  revisionBehaviour: RevisionBehaviour;
  variantCount: number;
  actions: DesignLibraryActions;
  onSelectDesign: (designId: string) => void;
  onSelectVariant: (variantId: string | undefined) => void;
}

export function DesignPage(props: DesignPageProps) {
  const { actions, activeDesignId, activeVariantId } = props;
  const [design, setDesign] = useState<DesignView | null>(null);
  const [preview, setPreview] = useState<{
    html: string;
    manifest: TweakManifest;
    overrides: Record<string, TweakValue>;
    values: Record<string, TweakValue>;
    dropped: DroppedTweakControl[];
  } | null>(null);
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [instruction, setInstruction] = useState('');
  const [copied, setCopied] = useState(false);
  const previousVariant = useRef<string | undefined>(undefined);

  const live = props.designs.filter((entry) => entry.deletedAt === undefined);

  useEffect(() => {
    if (!activeDesignId) {
      setDesign(null);
      return;
    }
    let active = true;
    void actions.openDesign(activeDesignId).then((result) => {
      const record = result.details?.design as DesignView | undefined;
      if (active) setDesign(record ?? null);
    });
    return () => {
      active = false;
    };
  }, [activeDesignId, actions, props.jobs]);

  useEffect(() => {
    if (!activeDesignId || !activeVariantId) {
      setPreview(null);
      return;
    }
    let active = true;
    void actions.readPreview(activeDesignId, activeVariantId).then((result) => {
      if (!active) return;
      if (result.isError) {
        setPreview(null);
        return;
      }
      setPreview({
        html: result.text,
        manifest: result.details?.manifest as TweakManifest,
        overrides: (result.details?.overrides ?? {}) as Record<string, TweakValue>,
        values: (result.details?.values ?? {}) as Record<string, TweakValue>,
        dropped: (result.details?.dropped ?? []) as DroppedTweakControl[],
      });
    });
    return () => {
      active = false;
    };
  }, [activeDesignId, activeVariantId, actions]);

  // Changing the active variant is a checkpoint boundary for the panel session.
  useEffect(() => {
    const previous = previousVariant.current;
    if (previous && previous !== activeVariantId && activeDesignId) {
      void actions.checkpointTweaks(activeDesignId, previous, 'variant-changed');
    }
    previousVariant.current = activeVariantId;
  }, [activeVariantId, activeDesignId, actions]);

  const persistTweaks = useDebouncedCallback((overrides: Record<string, TweakValue>) => {
    if (!activeDesignId || !activeVariantId) return;
    void actions.saveTweaks(activeDesignId, activeVariantId, overrides);
  }, 400);

  const onTweakChange = useCallback((id: string, value: TweakValue) => {
    setPreview((current) => {
      if (!current) return current;
      const overrides = { ...current.overrides, [id]: value };
      persistTweaks(overrides);
      return { ...current, overrides, values: { ...current.values, [id]: value } };
    });
  }, [persistTweaks]);

  const onTweakReset = useCallback((id?: string) => {
    if (!activeDesignId || !activeVariantId) return;
    void actions.resetTweak(activeDesignId, activeVariantId, id).then(() =>
      actions.readPreview(activeDesignId, activeVariantId).then((result) => {
        if (result.isError) return;
        setPreview((current) => current && {
          ...current,
          overrides: (result.details?.overrides ?? {}) as Record<string, TweakValue>,
          values: (result.details?.values ?? {}) as Record<string, TweakValue>,
        });
      }));
  }, [actions, activeDesignId, activeVariantId]);

  const onCopyCss = useCallback(() => {
    if (!activeDesignId || !activeVariantId) return;
    void actions.copyTweakCss(activeDesignId, activeVariantId).then(async (result) => {
      await navigator.clipboard?.writeText(result.text).catch(() => undefined);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [actions, activeDesignId, activeVariantId]);

  const activeVariant = useMemo(
    () => design?.variants.find((variant) => variant.id === activeVariantId),
    [design, activeVariantId],
  );

  const blockingConflicts = design?.conflicts.filter((conflict) => conflict.resolvedAt === undefined) ?? [];

  if (live.length === 0) {
    return (
      <div className="dl-page dl-page--centred">
        <SurfaceState
          detail="Select up to six references in the Library, then create a Design."
          kind="empty"
          title="No Designs yet"
        />
      </div>
    );
  }

  return (
    <div className="dl-page">
      <nav aria-label="Designs" className="dl-design-list">
        {live.map((entry) => (
          <button
            className={cn('dl-design-list__item', entry.id === activeDesignId && 'dl-design-list__item--active')}
            key={entry.id}
            onClick={() => props.onSelectDesign(entry.id)}
            type="button"
          >
            <strong>{entry.title}</strong>
            <span>{entry.readyVariantCount}/{entry.variantCount} variants</span>
          </button>
        ))}
      </nav>

      <div className="dl-canvas-layout">
        {design ? (
          <>
            <div className="dl-canvas-toolbar">
              <div className="dl-variant-tabs">
                {design.variants.map((variant) => (
                  <button
                    className={cn('dl-tab', variant.id === activeVariantId && 'dl-tab--active')}
                    key={variant.id}
                    onClick={() => props.onSelectVariant(variant.id)}
                    type="button"
                  >
                    {variant.status === 'running'
                      ? <LoaderCircle aria-hidden="true" className="dl-spin" size={12} />
                      : null}
                    {variant.title}
                  </button>
                ))}
              </div>
              <div className="dl-canvas-toolbar__right">
                <ToggleGroup
                  aria-label="Preview viewport"
                  onValueChange={(next) => {
                    if (next) setViewport(next as typeof viewport);
                  }}
                  size="sm"
                  type="single"
                  value={viewport}
                  variant="outline"
                >
                  {(['desktop', 'tablet', 'mobile'] as const).map((size) => (
                    <ToggleGroupItem key={size} value={size}>{size}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Button
                  onClick={() => void actions.generate(design.id, props.variantCount)}
                  size="sm"
                  variant="outline"
                >
                  <Wand2 aria-hidden="true" size={14} />
                  Generate
                </Button>
                {activeVariantId ? (
                  <Button
                    onClick={() => void actions.saveToGallery(design.id, activeVariantId)}
                    size="sm"
                  >
                    <Save aria-hidden="true" size={14} />
                    Save to Gallery
                  </Button>
                ) : null}
              </div>
            </div>

            {blockingConflicts.length > 0 ? (
              <div className="dl-inline-notice dl-inline-notice--warning" role="alert">
                <AlertTriangle aria-hidden="true" size={15} />
                <div>
                  <strong>Resolve these guardrail conflicts before generating</strong>
                  {blockingConflicts.map((conflict) => (
                    <p key={`${conflict.always}|${conflict.never}`}>
                      “{conflict.always}” conflicts with “{conflict.never}”
                      <Button
                        onClick={() => void actions.resolveConflict(
                          design.id,
                          conflict.always,
                          conflict.never,
                          'keep-always',
                        )}
                        size="sm"
                        variant="ghost"
                      >
                        Keep Always
                      </Button>
                      <Button
                        onClick={() => void actions.resolveConflict(
                          design.id,
                          conflict.always,
                          conflict.never,
                          'keep-never',
                        )}
                        size="sm"
                        variant="ghost"
                      >
                        Keep Never
                      </Button>
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            {activeVariant?.status === 'failed' ? (
              <SurfaceState
                actionLabel="Retry variant"
                detail={activeVariant.errorMessage ?? 'The variant did not complete.'}
                kind="error"
                title="Variant generation failed"
              />
            ) : null}

            <div className="dl-canvas">
              <PreviewFrame
                html={preview?.html ?? null}
                title={`${design.title} preview`}
                values={preview?.values ?? {}}
                viewport={viewport}
              />

              {preview ? (
                <TweaksPanel
                  dropped={preview.dropped}
                  manifest={preview.manifest}
                  onChange={onTweakChange}
                  onCopyCss={onCopyCss}
                  onReset={onTweakReset}
                  overrides={preview.overrides}
                  values={preview.values}
                />
              ) : null}
            </div>

            {copied ? <p className="dl-inline-notice">Effective CSS copied.</p> : null}

            {activeVariantId ? (
              <div className="dl-revise">
                <Input
                  aria-label="Revision instruction"
                  onChange={(event) => setInstruction(event.target.value)}
                  placeholder="Describe the change you want"
                  value={instruction}
                />
                <Button
                  disabled={instruction.trim() === ''}
                  onClick={() => {
                    void actions.revise(design.id, activeVariantId, instruction, props.revisionBehaviour);
                    setInstruction('');
                  }}
                  size="sm"
                >
                  Revise
                </Button>
                {activeVariant?.status === 'failed' || activeVariant?.status === 'cancelled' ? (
                  <Button
                    onClick={() => void actions.variantAction(design.id, activeVariantId, 'retry_variant')}
                    size="sm"
                    variant="outline"
                  >
                    Retry variant
                  </Button>
                ) : null}
                {activeVariant?.status === 'running' ? (
                  <Button
                    onClick={() => void actions.variantAction(design.id, activeVariantId, 'cancel_variant')}
                    size="sm"
                    variant="outline"
                  >
                    Cancel variant
                  </Button>
                ) : null}
              </div>
            ) : null}

            {design.assets.length > 0 ? (
              <div aria-label="Design assets" className="dl-asset-tray">
                {design.assets.map((asset) => (
                  <div className="dl-asset-tray__item" key={asset.id}>
                    <Badge variant={asset.status === 'placeholder' ? 'outline' : 'secondary'}>
                      {asset.title}
                    </Badge>
                    {asset.status === 'placeholder' ? (
                      <Button
                        onClick={() => void actions.designAssets(design.id, 'retry', asset.id)}
                        size="sm"
                        variant="ghost"
                      >
                        Retry artwork
                      </Button>
                    ) : null}
                    <Button
                      onClick={() => void actions.designAssets(design.id, 'promote', asset.id)}
                      size="sm"
                      variant="ghost"
                    >
                      Copy to Library
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <SurfaceState
            detail="Choose a Design from the list to continue."
            kind="empty"
            title="No Design selected"
          />
        )}
      </div>
    </div>
  );
}
