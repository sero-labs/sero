import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@sero-ai/ui';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import type { MediaCapability, MediaModelOptions } from '../../shared/media';
import {
  DEFAULT_VIDEO_SECONDS,
  MAX_VIDEO_SECONDS,
  MEDIA_CAPABILITIES,
  missingRequirement,
  needsConfirmation,
  needsSource,
} from '../../shared/media';
import { allowedDurations, videoLengthRefusal } from '../../shared/media-options';
import { capabilityLabel } from '../lib/asset-view';

/**
 * Asking for artwork, from either place it can be asked for (D5).
 *
 * One dialog for the Design tray and for the Library, because they are the same
 * request with a different destination — and because two dialogs would be two
 * places for the capability rules to drift. The provider is never named: you
 * choose a *capability*, and the model behind it is a setting (D7).
 */

export type GenerateTarget =
  | { kind: 'design'; designId: string; designTitle: string }
  | { kind: 'library' };

/** Something a restyle or an upscale can work from. */
export interface GenerateSource {
  id: string;
  label: string;
}

export interface GenerateRequest {
  capability: MediaCapability;
  prompt: string;
  sourceId?: string;
  aspectRatio?: string;
  durationSeconds?: number;
}

export interface GenerateDialogProps {
  open: boolean;
  target: GenerateTarget;
  /** Assets in this Design, or Library items — whichever the target can use. */
  sources: GenerateSource[];
  /**
   * A source the dialog opens already working from — Restyle on a chosen
   * reference. The capability follows it, because arriving on "new image" with
   * a source selected says the source will be used when it will not be.
   */
  initialSourceId?: string;
  /**
   * What each capability's model accepts, as the provider last reported it.
   *
   * Absent for a capability means nobody could say, and the fallbacks below
   * apply. Present means these are the only values that will work, so they are
   * the only ones offered — the previous behaviour, offering a plausible clip
   * length and letting the provider reject it, produced nothing at all on a
   * model that takes 5 or 10 seconds.
   */
  modelOptions?: Partial<Record<MediaCapability, MediaModelOptions>>;
  onOpenChange(open: boolean): void;
  onGenerate(request: GenerateRequest): void;
}

const FALLBACK_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:2'];
const DEFAULT_ASPECT = '16:9';
/** Long enough to read as motion, short enough that a mistake is cheap. */
const FALLBACK_DURATIONS = [DEFAULT_VIDEO_SECONDS, 10].filter(
  (seconds) => seconds <= MAX_VIDEO_SECONDS,
);

export function GenerateDialog({
  open,
  target,
  sources,
  initialSourceId,
  modelOptions,
  onOpenChange,
  onGenerate,
}: GenerateDialogProps) {
  const [capability, setCapability] = useState<MediaCapability>(
    initialSourceId === undefined ? 'text-to-image' : 'image-to-image',
  );
  const [prompt, setPrompt] = useState('');
  const [sourceId, setSourceId] = useState<string>(initialSourceId ?? '');
  const [chosenAspect, setChosenAspect] = useState<string | null>(null);
  const [chosenDuration, setChosenDuration] = useState<number | null>(null);

  // What this capability's model will take. Derived rather than held in state:
  // the answer changes with the capability and again when the runtime publishes
  // fresh options, and a stored choice that is no longer on the list is exactly
  // the request the provider rejects.
  const options = modelOptions?.[capability];
  const durations = allowedDurations(options) ?? FALLBACK_DURATIONS;
  // The model makes nothing short enough to be worth buying. Said here and
  // refused again in the runtime, because the request also arrives from a tool.
  const tooLong = videoLengthRefusal(capability, options);
  const durationSeconds =
    chosenDuration !== null && durations.includes(chosenDuration)
      ? chosenDuration
      : (durations[0] ?? DEFAULT_VIDEO_SECONDS);
  const ratios = options?.aspectRatios ?? FALLBACK_ASPECT_RATIOS;
  const aspectRatio =
    chosenAspect !== null && ratios.includes(chosenAspect)
      ? chosenAspect
      : (ratios.find((ratio) => ratio === DEFAULT_ASPECT) ?? ratios[0]);

  const wantsSource = needsSource(capability);
  // The same check the tool and the model's own tool run, so the dialog cannot
  // offer a request either of them would refuse.
  const missing = missingRequirement(capability, {
    prompt,
    ...(sourceId === '' ? {} : { sourceIds: [sourceId] }),
  });
  const noSources = wantsSource && sources.length === 0;
  const blocked = missing !== null || noSources || tooLong !== null;

  const submit = () => {
    if (blocked) return;
    onGenerate({
      capability,
      prompt: prompt.trim(),
      ...(wantsSource ? { sourceId } : {}),
      ...(capability === 'upscale' ? {} : { aspectRatio }),
      ...(capability === 'text-to-video' ? { durationSeconds } : {}),
    });
    setPrompt('');
    setSourceId('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {target.kind === 'library' ? 'Generate inspiration' : 'Generate artwork'}
          </DialogTitle>
          <DialogDescription>
            {target.kind === 'library'
              ? 'New references enter the Library and are analysed automatically.'
              : `Artwork for ${target.designTitle}, reusable across its variants.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ToggleGroup
            type="single"
            value={capability}
            onValueChange={(value) => {
              if (value !== '') setCapability(value as MediaCapability);
            }}
            className="grid grid-cols-4"
            aria-label="Capability"
          >
            {MEDIA_CAPABILITIES.map((entry) => (
              <ToggleGroupItem key={entry} value={entry}>
                {capabilityLabel(entry)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/*
            A reference chosen for a restyle stays chosen when the capability
            changes, and the row that showed it disappears — so the request went
            out from the words alone while the dialog still looked like it was
            working from the picture. It says so now instead.
          */}
          {!wantsSource && sourceId !== '' && (
            <p className="text-muted-foreground text-sm">
              {capabilityLabel(capability)} works from your description alone. The reference you
              chose will not be used.
            </p>
          )}

          {wantsSource && (
            <div className="space-y-1.5">
              <Label htmlFor="generate-source">Work from</Label>
              {noSources ? (
                <p className="text-muted-foreground text-sm">
                  {target.kind === 'library'
                    ? 'Nothing in the Library to work from yet.'
                    : 'This Design has no artwork to work from yet.'}
                </p>
              ) : (
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger id="generate-source">
                    <SelectValue placeholder="Choose a source" />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="generate-prompt">
              {capability === 'upscale' ? 'Guidance for the upscaler (optional)' : 'Describe it'}
            </Label>
            <Textarea
              id="generate-prompt"
              rows={4}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={
                capability === 'text-to-video'
                  ? 'What the video should show, including the motion.'
                  : 'Hero imagery, textures, abstract graphics — not interface icons.'
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {capability !== 'upscale' && (
              <div className="space-y-1.5">
                <Label htmlFor="generate-aspect">Aspect</Label>
                <Select value={aspectRatio} onValueChange={setChosenAspect}>
                  <SelectTrigger id="generate-aspect">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ratios.map((ratio) => (
                      <SelectItem key={ratio} value={ratio}>
                        {ratio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {capability === 'text-to-video' && (
              <div className="space-y-1.5">
                <Label htmlFor="generate-duration">Length</Label>
                <Select
                  value={String(durationSeconds)}
                  onValueChange={(value) => setChosenDuration(Number(value))}
                >
                  <SelectTrigger id="generate-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {durations.map((seconds) => (
                      <SelectItem key={seconds} value={String(seconds)}>
                        {seconds} seconds
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-muted-foreground flex-1 text-xs">
            {tooLong ??
              (needsConfirmation(capability)
                ? 'Video is the most expensive capability and asks again before it spends.'
                : 'The model behind each capability is a setting, not a choice made here.')}
          </p>
          <Button type="button" onClick={submit} disabled={blocked}>
            <Sparkles className="size-3.5" />
            Generate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
