import {
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@sero-ai/ui';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import type { MediaCapability, MediaModelOptions } from '../../shared/media';
import type { MediaKind } from '../../shared/records';
import {
  DEFAULT_VIDEO_SECONDS,
  MAX_VIDEO_SECONDS,
  isVideoCapability,
  missingRequirement,
  needsConfirmation,
  needsSource,
} from '../../shared/media';
import { allowedDurations, videoLengthRefusal } from '../../shared/media-options';

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
  kind: MediaKind;
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
   * A source the dialog opens already working from — Remix on a chosen
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

type GenerationOperation =
  | 'fresh-image'
  | 'fresh-video'
  | 'reference-image'
  | 'reference-video'
  | 'restyle'
  | 'upscale';

interface OperationChoice {
  value: GenerationOperation;
  label: string;
  description?: string;
}

const FRESH_OPERATIONS: OperationChoice[] = [
  { value: 'fresh-image', label: 'Image' },
  { value: 'fresh-video', label: 'Video' },
];

const CREATE_OPERATIONS: OperationChoice[] = [
  { value: 'reference-image', label: 'Image', description: 'Use this as visual direction' },
  { value: 'reference-video', label: 'Video', description: 'Animate from this reference' },
];

const EDIT_OPERATIONS: OperationChoice[] = [
  { value: 'restyle', label: 'Restyle', description: 'Change its visual style' },
  { value: 'upscale', label: 'Upscale', description: 'Increase its resolution' },
];

const OPERATION_CAPABILITY: Record<GenerationOperation, MediaCapability> = {
  'fresh-image': 'text-to-image',
  'fresh-video': 'text-to-video',
  'reference-image': 'image-to-image',
  'reference-video': 'image-to-video',
  restyle: 'image-to-image',
  upscale: 'upscale',
};

const ACTION_LABEL: Record<GenerationOperation, string> = {
  'fresh-image': 'Generate image',
  'fresh-video': 'Generate video',
  'reference-image': 'Generate image',
  'reference-video': 'Generate video',
  restyle: 'Restyle',
  upscale: 'Upscale',
};

export function GenerateDialog({
  open,
  target,
  sources,
  initialSourceId,
  modelOptions,
  onOpenChange,
  onGenerate,
}: GenerateDialogProps) {
  const remix = initialSourceId !== undefined;
  const [operation, setOperation] = useState<GenerationOperation>(
    remix ? 'reference-image' : 'fresh-image',
  );
  const capability = OPERATION_CAPABILITY[operation];
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
  const supportsAspectRatio = options?.supportsAspectRatio !== false;
  const ratios = options?.aspectRatios ?? FALLBACK_ASPECT_RATIOS;
  const aspectRatio =
    chosenAspect !== null && ratios.includes(chosenAspect)
      ? chosenAspect
      : (ratios.find((ratio) => ratio === DEFAULT_ASPECT) ?? ratios[0]);

  const wantsSource = needsSource(capability);
  const video = isVideoCapability(capability);
  const imageSources = sources.filter((source) => source.kind === 'image');
  const sourceOptions = imageSources.map((source) => ({ value: source.id, label: source.label }));
  const selectedSource = sourceOptions.find((source) => source.value === sourceId) ?? null;
  // The same check the tool and the model's own tool run, so the dialog cannot
  // offer a request either of them would refuse.
  const missing = missingRequirement(capability, {
    prompt,
    ...(sourceId === '' ? {} : { sourceIds: [sourceId] }),
  });
  const noSources = wantsSource && imageSources.length === 0;
  const blocked = missing !== null || noSources || tooLong !== null;

  const submit = () => {
    if (blocked) return;
    onGenerate({
      capability,
      prompt: prompt.trim(),
      ...(wantsSource ? { sourceId } : {}),
      ...(capability === 'upscale' || !supportsAspectRatio ? {} : { aspectRatio }),
      ...(video ? { durationSeconds } : {}),
    });
    setPrompt('');
    setSourceId('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{remix ? 'Remix reference' : 'Generate'}</DialogTitle>
          <DialogDescription>
            {remix
              ? 'Create new media or edit the selected reference.'
              : target.kind === 'library'
                ? 'New references enter the Library and are analysed automatically.'
                : `Artwork for ${target.designTitle}, reusable across its variants.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {(remix
            ? [
                { label: 'Create new', choices: CREATE_OPERATIONS },
                { label: 'Edit this reference', choices: EDIT_OPERATIONS },
              ]
            : [{ label: undefined, choices: FRESH_OPERATIONS }]
          ).map((group) => (
            <section key={group.label ?? 'fresh'} className="space-y-2">
              {group.label && <h3 className="text-muted-foreground text-xs font-medium">{group.label}</h3>}
              <Tabs
                value={group.choices.some((choice) => choice.value === operation) ? operation : ''}
                onValueChange={(value) => setOperation(value as GenerationOperation)}
              >
                <TabsList variant="line" className="justify-start">
                  {group.choices.map((choice) => (
                    <TabsTrigger
                      key={choice.value}
                      value={choice.value}
                      className="data-[state=active]:text-primary after:bg-primary flex-none px-3"
                    >
                      {choice.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {group.choices.map((choice) =>
                  choice.description ? (
                    <TabsContent
                      key={choice.value}
                      value={choice.value}
                      className="text-muted-foreground text-sm"
                    >
                      {choice.description}
                    </TabsContent>
                  ) : null,
                )}
              </Tabs>
            </section>
          ))}

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
                <Combobox
                  items={sourceOptions}
                  value={selectedSource}
                  onValueChange={(source) => setSourceId(source?.value ?? '')}
                >
                  <ComboboxInput id="generate-source" placeholder="Search references" className="w-full" />
                  <ComboboxContent>
                    <ComboboxEmpty>No references found</ComboboxEmpty>
                    <ComboboxList>
                      {(source) => (
                        <ComboboxItem key={source.value} value={source}>
                          {source.label}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="generate-prompt">
              {capability === 'upscale' ? 'Guidance for the upscaler (optional)' : 'Describe it'}
            </Label>
            <Textarea
              id="generate-prompt"
              rows={6}
              className="min-h-32"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={
                video
                  ? 'What the video should show, including the motion.'
                  : 'Hero imagery, textures, abstract graphics — not interface icons.'
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {capability !== 'upscale' && supportsAspectRatio && (
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

            {video && (
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
          {(tooLong !== null || needsConfirmation(capability)) && (
            <p className="text-muted-foreground flex-1 text-xs">
              {tooLong ?? 'Video is the most expensive capability and asks again before it spends.'}
            </p>
          )}
          <Button type="button" onClick={submit} disabled={blocked} className="ml-auto">
            <Sparkles className="size-3.5" />
            {ACTION_LABEL[operation]}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
