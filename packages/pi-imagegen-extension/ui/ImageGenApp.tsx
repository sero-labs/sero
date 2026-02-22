/**
 * ImageGenApp — Sero app for Gemini Nano Banana image generation.
 *
 * Top: generation form. Below: bento gallery of generated images.
 * Supports direct generation (via IPC) and agent-mediated (via chat).
 */

import { useState, useCallback, useRef, useEffect, useContext } from 'react';
import { useAppState, AppContext } from '@sero/app-runtime';
import { ScrollArea } from '@sero/ui/components/ui/scroll-area';
import type { ImageGenState, GenerateParams } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { GenerateForm } from './components/GenerateForm';
import { Gallery } from './components/Gallery';
import { EmptyState } from './components/EmptyState';
import './styles.css';

interface SeroImagegenBridge {
  generate(workspaceId: string, params: any): Promise<{ generation: any; error?: string }>;
  readImage(filePath: string): Promise<string>;
}

function getBridge(): SeroImagegenBridge | null {
  return (window as any).sero?.imagegen ?? null;
}

export function ImageGenApp() {
  const [state] = useAppState<ImageGenState>(DEFAULT_STATE);
  const ctx = useContext(AppContext);
  const workspaceId = ctx?.workspaceId ?? '';
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleGenerate = useCallback(
    async (params: GenerateParams) => {
      const bridge = getBridge();
      if (!bridge) {
        setError('Image generation bridge not available');
        return;
      }
      if (!workspaceId) {
        setError('No workspace selected');
        return;
      }

      setGenerating(true);
      setError(null);

      try {
        const result = await bridge.generate(workspaceId, params);
        if (result.error && !result.generation) {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed');
      } finally {
        setGenerating(false);
      }
    },
    [workspaceId],
  );

  const hasGenerations = state.generations.length > 0;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="flex h-full w-full flex-col bg-background outline-none"
    >
      {/* Header + Form */}
      <div className="shrink-0 border-b border-border px-5 py-4">
        <div className="mb-3 flex items-baseline gap-2">
          <h1 className="text-base font-semibold text-foreground">ImageGen</h1>
          <span className="text-xs text-muted-foreground">
            Gemini Nano Banana
          </span>
        </div>
        <GenerateForm onGenerate={handleGenerate} generating={generating} />
        {error && (
          <p className="mt-2 text-xs text-destructive animate-fade-in-up">
            {error}
          </p>
        )}
      </div>

      {/* Gallery */}
      <ScrollArea className="flex-1">
        <div className="p-5">
          {hasGenerations ? (
            <Gallery generations={state.generations} />
          ) : (
            <EmptyState />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default ImageGenApp;
