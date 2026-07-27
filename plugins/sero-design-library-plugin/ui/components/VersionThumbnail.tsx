/**
 * The Gallery card image.
 *
 * The stored snapshot preview is deterministic: it is a script-free,
 * animation-free document, so rendering it in a scaled, fully sandboxed frame
 * always produces the same picture. Frames mount only once the card scrolls
 * into view, which keeps a large Gallery practical.
 */

import { useEffect, useRef, useState } from 'react';
import type { DesignLibraryActions } from '../runtime';

export interface VersionThumbnailProps {
  familyId: string;
  versionId: string;
  title: string;
  actions: DesignLibraryActions;
}

const RENDER_WIDTH = 1280;

export function VersionThumbnail({ familyId, versionId, title, actions }: VersionThumbnailProps) {
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const node = holder.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = holder.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / RENDER_WIDTH);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    let created: string | null = null;

    void actions.galleryAction('read_preview', { familyId, versionId }).then((result) => {
      if (!active || result.isError) return;
      created = URL.createObjectURL(new Blob([result.text], { type: 'text/html;charset=utf-8' }));
      setBlobUrl(created);
    });

    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [visible, familyId, versionId, actions]);

  return (
    <div className="dl-thumbnail" ref={holder}>
      {blobUrl ? (
        <iframe
          className="dl-thumbnail__frame"
          referrerPolicy="no-referrer"
          // No `allow-scripts`: a thumbnail must never execute saved code.
          sandbox=""
          src={blobUrl}
          style={{ width: RENDER_WIDTH, height: RENDER_WIDTH * 0.625, transform: `scale(${scale})` }}
          tabIndex={-1}
          title={`${title} preview`}
        />
      ) : (
        <span className="dl-thumbnail__placeholder" />
      )}
    </div>
  );
}
