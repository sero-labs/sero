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

import type { MediaCapability } from '../../shared/media';
import {
  MAX_VIDEO_SECONDS,
  MEDIA_CAPABILITIES,
  missingRequirement,
  needsConfirmation,
  needsSource,
} from '../../shared/media';
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
  onOpenChange(open: boolean): void;
  onGenerate(request: GenerateRequest): void;
}

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:2'];
const DEFAULT_ASPECT = '16:9';
/** Long enough to read as motion, short enough that a mistake is cheap. */
const DURATIONS = [4, 6, 8].filter((seconds) => seconds <= MAX_VIDEO_SECONDS);

export function GenerateDialog({
  open,
  target,
  sources,
  initialSourceId,
  onOpenChange,
  onGenerate,
}: GenerateDialogProps) {
  const [capability, setCapability] = useState<MediaCapability>(
    initialSourceId === undefined ? 'text-to-image' : 'image-to-image',
  );
  const [prompt, setPrompt] = useState('');
  const [sourceId, setSourceId] = useState<string>(initialSourceId ?? '');
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT);
  const [durationSeconds, setDurationSeconds] = useState(DURATIONS[0] ?? 4);

  const wantsSource = needsSource(capability);
  // The same check the tool and the model's own tool run, so the dialog cannot
  // offer a request either of them would refuse.
  const missing = missingRequirement(capability, {
    prompt,
    ...(sourceId === '' ? {} : { sourceIds: [sourceId] }),
  });
  const noSources = wantsSource && sources.length === 0;

  const submit = () => {
    if (missing !== null || noSources) return;
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
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger id="generate-aspect">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECT_RATIOS.map((ratio) => (
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
                  onValueChange={(value) => setDurationSeconds(Number(value))}
                >
                  <SelectTrigger id="generate-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((seconds) => (
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
            {needsConfirmation(capability)
              ? 'Video is the most expensive capability and asks again before it spends.'
              : 'The model behind each capability is a setting, not a choice made here.'}
          </p>
          <Button type="button" onClick={submit} disabled={missing !== null || noSources}>
            <Sparkles className="size-3.5" />
            Generate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
