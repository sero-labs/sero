/**
 * One tool call inside a group, built on `ai-elements/tool`.
 *
 * While a write streams its arguments the file content is the only thing
 * worth showing — the tool has not run, so there is no output yet.
 */

import { memo, useState } from 'react';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolOutput,
} from '@sero-ai/ui/ai-elements/tool';
import type { ToolCall } from '@/stores/chat';
import { mapToolState } from '@/lib/tool-call-state';
import { ImageLightbox } from './ImageLightbox';

/** Output longer than this is cut; the full text stays in the session. */
const MAX_OUTPUT_PREVIEW = 2000;

/** Tail of a streaming write, so the newest lines stay in view. */
const STREAM_PREVIEW_LINES = 40;

export const ToolCallItem = memo(function ToolCallItem({ tool }: { tool: ToolCall }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const streamedContent =
    tool.isStreamingInput && typeof tool.input?.content === 'string'
      ? tool.input.content
      : null;
  const streamedPath = typeof tool.input?.path === 'string' ? tool.input.path : null;
  const images = tool.images ?? [];
  const output =
    tool.output && tool.output.length > MAX_OUTPUT_PREVIEW
      ? `${tool.output.slice(0, MAX_OUTPUT_PREVIEW)}…`
      : tool.output;

  const hasBody = !!streamedContent || images.length > 0 || !!output;

  return (
    <Tool className="mb-0 rounded-none border-0 border-b border-[var(--border-subtle)] last:border-b-0">
      <ToolHeader
        type="dynamic-tool"
        toolName={tool.toolName}
        title={streamedPath ? `${tool.toolName} · ${streamedPath}` : tool.toolName}
        state={mapToolState(tool.state)}
        className="px-3 py-2"
      />

      {hasBody && (
        <ToolContent className="space-y-2 px-3 pt-0 pb-3">
          {streamedContent !== null && (
            <pre className="flex max-h-[200px] flex-col justify-end overflow-hidden whitespace-pre rounded bg-[var(--bg-base)] p-2 font-mono text-xs text-[var(--text-muted)]">
              {streamedContent.split('\n').slice(-STREAM_PREVIEW_LINES).join('\n')}
            </pre>
          )}

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((image, index) => {
                const src = `data:${image.mimeType};base64,${image.data}`;
                return (
                  <button
                    type="button"
                    key={src}
                    onClick={() => setLightboxSrc(src)}
                    className="cursor-zoom-in"
                  >
                    <img
                      src={src}
                      alt={image.description ?? `Tool result ${index + 1}`}
                      className="max-h-[200px] max-w-[300px] rounded-md border border-[var(--border-subtle)] object-contain transition-colors hover:border-[var(--border-focus)]"
                    />
                  </button>
                );
              })}
            </div>
          )}

          {output && (
            <ToolOutput
              className="text-xs"
              output={
                <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded bg-[var(--bg-base)] p-2 font-mono text-xs text-[var(--text-muted)]">
                  {output}
                </pre>
              }
              errorText={undefined}
            />
          )}
        </ToolContent>
      )}

      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt={tool.toolName}
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </Tool>
  );
});
