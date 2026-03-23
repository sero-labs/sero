/**
 * GenerateForm — prompt input + model/param controls for image generation.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { ImageModel, AspectRatio, GenerateParams, ImageAttachment } from '../../shared/types';
import { ImageAttachBar } from './ImageAttachBar';

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
];

interface GenerateFormProps {
  onGenerate: (params: GenerateParams) => void;
  generating: boolean;
}

export function GenerateForm({ onGenerate, generating }: GenerateFormProps) {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ImageModel>('gemini-2.5-flash-image');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [variations, setVariations] = useState(1);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea: min 2 rows, max 10 rows, then scroll
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const maxHeight = lineHeight * 10;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [prompt]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || generating) return;
      onGenerate({
        prompt: prompt.trim(),
        model,
        aspectRatio,
        variations,
        negativePrompt: negativePrompt.trim() || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setAttachments([]);
    },
    [prompt, model, aspectRatio, variations, negativePrompt, attachments, generating, onGenerate],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Prompt */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want to create…"
          rows={2}
          className={cn(
            'w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5',
            'text-sm text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring/50',
            'transition-shadow duration-200',
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
          }}
        />
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Model toggle */}
        <div className="flex rounded-md border border-input p-0.5">
          <button
            type="button"
            onClick={() => setModel('gemini-2.5-flash-image')}
            className={cn(
              'rounded-sm px-2.5 py-1 text-xs font-medium transition-all duration-150',
              model === 'gemini-2.5-flash-image'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            ⚡ Flash
          </button>
          <button
            type="button"
            onClick={() => setModel('gemini-3-pro-image-preview')}
            className={cn(
              'rounded-sm px-2.5 py-1 text-xs font-medium transition-all duration-150',
              model === 'gemini-3-pro-image-preview'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            ✨ Pro
          </button>
        </div>

        {/* Aspect ratio pills */}
        <div className="flex gap-1">
          {ASPECT_RATIOS.slice(0, 5).map((ar) => (
            <button
              key={ar.value}
              type="button"
              onClick={() => setAspectRatio(ar.value)}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-mono transition-all duration-150',
                aspectRatio === ar.value
                  ? 'bg-secondary text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
              )}
            >
              {ar.label}
            </button>
          ))}
        </div>

        {/* Variations */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-muted-foreground">Variations</span>
          <div className="flex rounded-md border border-input p-0.5">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setVariations(n)}
                className={cn(
                  'w-6 h-6 rounded-sm text-xs font-medium transition-all duration-150',
                  variations === n
                    ? 'bg-secondary text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAdvanced ? '▾ Less' : '▸ More'}
        </button>
      </div>

      {/* Attachments */}
      <ImageAttachBar
        attachments={attachments}
        onChange={setAttachments}
        disabled={generating}
      />

      {/* Advanced options */}
      {showAdvanced && (
        <div className="animate-fade-in-up">
          <input
            type="text"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="Negative prompt — things to avoid…"
            className={cn(
              'w-full rounded-md border border-input bg-background px-3 py-1.5',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring/50',
            )}
          />
        </div>
      )}

      {/* Generate button */}
      <Button
        type="submit"
        disabled={!prompt.trim() || generating}
        className="w-full"
      >
        {generating ? (
          <span className="flex items-center gap-2">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Generating…
          </span>
        ) : (
          <span>
            Generate {variations > 1 ? `${variations} images` : 'image'}
          </span>
        )}
      </Button>
    </form>
  );
}
