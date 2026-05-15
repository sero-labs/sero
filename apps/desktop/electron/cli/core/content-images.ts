import { prepareToolImage } from '@electron/shared/media/image-resize';
import type { CliContentBlock } from './types';

function normalizeFallbackText(text: string | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Ensure every CLI image block is API-ready before it can enter an agent turn.
 *
 * Commands may return raw screenshots from host features, bridged plugins, or
 * legacy adapters. Normalize them at the CLI boundary so single-command
 * results, direct-sero prompts, and streaming updates all share the same image
 * size/compression policy.
 */
export function prepareCliImageContent(
  content: CliContentBlock[] | undefined,
  fallbackText?: string,
): CliContentBlock[] | undefined {
  if (!content?.length) return content;

  const output: CliContentBlock[] = [];
  const hasText = content.some((block) => block.type === 'text' && block.text.trim());
  let insertedFallback = false;

  for (const block of content) {
    if (block.type === 'text') {
      output.push(block);
      continue;
    }

    const fallback = !hasText && !insertedFallback ? normalizeFallbackText(fallbackText) : null;
    if (fallback) {
      output.push({ type: 'text', text: fallback });
      insertedFallback = true;
    }

    const image = prepareToolImage(block.data, block.mimeType);
    if (image.text) {
      output.push({ type: 'text', text: image.text });
    }
    output.push({ type: 'image', data: image.data, mimeType: image.mimeType });
  }

  return output;
}
