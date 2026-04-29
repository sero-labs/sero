import { useCallback, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';
import type { McpResourcePreview } from '../../shared/types';

export interface McpResourceReaderState {
  loading: boolean;
  error: string | null;
  activeResourceUri: string | null;
  preview: McpResourcePreview | null;
  loadResource: (serverName: string, resourceUri: string) => Promise<void>;
  clearPreview: () => void;
}

export function useMcpResourceReader(): McpResourceReaderState {
  const { run } = useAppTools();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeResourceUri, setActiveResourceUri] = useState<string | null>(null);
  const [preview, setPreview] = useState<McpResourcePreview | null>(null);

  const loadResource = useCallback(async (serverName: string, resourceUri: string) => {
    setLoading(true);
    setError(null);
    setActiveResourceUri(resourceUri);

    try {
      const result = await run('mcp_manager', {
        action: 'read_resource',
        serverName,
        resourceUri,
      });
      const nextPreview = isMcpResourcePreview(result.details?.resourcePreview)
        ? result.details.resourcePreview
        : null;
      setPreview(nextPreview);
      if (result.isError) {
        setError(result.text);
      } else if (!nextPreview) {
        setError('The MCP resource loaded, but no preview payload was returned.');
      }
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [run]);

  const clearPreview = useCallback(() => {
    setActiveResourceUri(null);
    setPreview(null);
    setError(null);
  }, []);

  return {
    loading,
    error,
    activeResourceUri,
    preview,
    loadResource,
    clearPreview,
  };
}

function isMcpResourcePreview(value: unknown): value is McpResourcePreview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const preview = value as Record<string, unknown>;
  return typeof preview.serverName === 'string'
    && typeof preview.requestedUri === 'string'
    && typeof preview.resolvedUri === 'string'
    && typeof preview.previewKind === 'string'
    && typeof preview.truncated === 'boolean';
}
