import { useAppTools } from '@sero-ai/app-runtime';
import { useEffect, useState } from 'react';

/**
 * A revision's built document, as a blob URL for the preview frame.
 *
 * The UI has no filesystem access, so the document arrives as text from a tool
 * call and becomes a blob here. A blob URL is what gives the frame an opaque
 * origin without a server: combined with `sandbox="allow-scripts"` and no
 * `allow-same-origin`, the page has no origin to share with anything.
 *
 * The URL is revoked when it changes or the frame goes away. Every one of these
 * pins its document in memory, and a page with React and Tailwind inlined runs to
 * hundreds of kilobytes.
 */

export interface PreviewTarget {
  designId: string;
  variantId: string;
  revisionId: string;
  fileName: string;
}

export interface PreviewDocument {
  url: string | null;
  error: string | null;
  loading: boolean;
}

export function usePreviewDocument(target: PreviewTarget | null): PreviewDocument {
  const tools = useAppTools();
  const [state, setState] = useState<PreviewDocument>({ url: null, error: null, loading: false });
  const key = target === null ? '' : Object.values(target).join('/');

  useEffect(() => {
    if (target === null) {
      setState({ url: null, error: null, loading: false });
      return;
    }

    let active = true;
    let created: string | null = null;
    setState({ url: null, error: null, loading: true });

    void tools
      .run('design_library_assets', { action: 'design-file', ...target })
      .then((result) => {
        const block = result.content.find((entry) => entry.type === 'text');
        const content = block && 'text' in block ? String(block.text) : '';
        if (result.details?.ok === false || content === '') {
          throw new Error(content === '' ? 'The preview document was empty.' : content);
        }
        if (!active) return;
        created = URL.createObjectURL(new Blob([content], { type: 'text/html' }));
        setState({ url: created, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          url: null,
          error: error instanceof Error ? error.message : String(error),
          loading: false,
        });
      });

    return () => {
      active = false;
      if (created !== null) URL.revokeObjectURL(created);
    };
    // `key` stands in for the target object, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tools]);

  return state;
}
