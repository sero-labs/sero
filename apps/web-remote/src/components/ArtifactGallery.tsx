/**
 * Artifact gallery, grid view of session screenshots/artifacts with lightbox.
 */

import { useState, useCallback, memo } from 'react';
import { useConnectionStore } from '@/stores/connection';
import { cn } from '@sero-ai/ui/lib/utils';
import {
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

interface Artifact {
  id: string;
  type: string;
  title: string;
  timestamp: string;
  base64?: string;
  mimeType?: string;
}

interface ArtifactGalleryProps {
  artifacts: Artifact[];
  onLoadArtifact: (artifactId: string) => void;
}

const ArtifactCard = memo(function ArtifactCard({
  artifact,
  onClick,
  onLoad,
}: {
  artifact: Artifact;
  onClick: () => void;
  onLoad: () => void;
}) {
  const hasData = !!artifact.base64;

  return (
    <button type="button"
      onClick={() => {
        if (!hasData) onLoad();
        onClick();
      }}
      className={cn(
        'border border-border rounded-lg overflow-hidden',
        'hover:border-primary/50 transition-colors',
        'bg-card',
      )}
    >
      <div className="aspect-video bg-background flex items-center justify-center">
        {hasData && artifact.mimeType?.startsWith('image/') ? (
          <img
            src={`data:${artifact.mimeType};base64,${artifact.base64}`}
            alt={artifact.title}
            className="size-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-1">
            {!hasData ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <ImageIcon className="size-6 opacity-50" />
            )}
          </div>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="text-xs font-medium truncate">{artifact.title}</p>
        <p className="text-[10px] text-muted-foreground">
          {new Date(artifact.timestamp).toLocaleString()}
        </p>
      </div>
    </button>
  );
});

function Lightbox({
  artifacts,
  index,
  onClose,
  onNavigate,
}: {
  artifacts: Artifact[];
  index: number;
  onClose: () => void;
  onNavigate: (delta: number) => void;
}) {
  const artifact = artifacts[index];
  if (!artifact) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
      {/* Close button */}
      <button type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
      >
        <X className="size-6" />
      </button>

      {/* Navigation */}
      {index > 0 && (
        <button type="button"
          onClick={() => onNavigate(-1)}
          className="absolute left-4 text-white/60 hover:text-white transition-colors"
        >
          <ChevronLeft className="size-8" />
        </button>
      )}
      {index < artifacts.length - 1 && (
        <button type="button"
          onClick={() => onNavigate(1)}
          className="absolute right-4 text-white/60 hover:text-white transition-colors"
        >
          <ChevronRight className="size-8" />
        </button>
      )}

      {/* Image */}
      <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center">
        {artifact.base64 && artifact.mimeType?.startsWith('image/') ? (
          <img
            src={`data:${artifact.mimeType};base64,${artifact.base64}`}
            alt={artifact.title}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
        ) : (
          <div className="text-white/60 text-center">
            <ImageIcon className="size-12 mx-auto mb-2" />
            <p>No preview available</p>
          </div>
        )}
        <div className="mt-3 text-center">
          <p className="text-white text-sm font-medium">{artifact.title}</p>
          <p className="text-white/60 text-xs">
            {index + 1} of {artifacts.length} &middot;{' '}
            {new Date(artifact.timestamp).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ArtifactGallery({ artifacts, onLoadArtifact }: ArtifactGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleNavigate = useCallback(
    (delta: number) => {
      if (lightboxIndex === null) return;
      const newIndex = lightboxIndex + delta;
      if (newIndex >= 0 && newIndex < artifacts.length) {
        setLightboxIndex(newIndex);
        // Load data if needed
        const artifact = artifacts[newIndex];
        if (!artifact.base64) {
          onLoadArtifact(artifact.id);
        }
      }
    },
    [lightboxIndex, artifacts, onLoadArtifact],
  );

  if (artifacts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <ImageIcon className="size-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No artifacts yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {artifacts.map((artifact, index) => (
          <ArtifactCard
            key={artifact.id}
            artifact={artifact}
            onClick={() => setLightboxIndex(index)}
            onLoad={() => onLoadArtifact(artifact.id)}
          />
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          artifacts={artifacts}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}

export type { Artifact };
