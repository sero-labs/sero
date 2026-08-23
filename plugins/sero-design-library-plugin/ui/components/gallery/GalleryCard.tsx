import { Button } from '@sero-ai/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sero-ai/ui/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sero-ai/ui/components/ui/select';
import { SquareArrowOutUpRight, Heart, ImageOff, MoreHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { GalleryFamilyRecord } from '../../../shared/gallery';
import type { ExportDestination } from '../../../shared/export';
import { useGalleryPreviewSrc } from '../../hooks/useAssetSrc';
import { useVisible } from '../../hooks/useVisible';
import { relativeTime } from '../../lib/time';

interface GalleryCardProps {
  family: GalleryFamilyRecord;
  onOpen(versionId: string): void;
  onFeature(versionId: string): void;
  onDuplicate(versionId: string): void;
  onRemix(versionId: string): void;
  onExport(versionId: string, destination: ExportDestination): void;
  onFavourite(favourite: boolean): void;
  onDelete(): void;
  onDeleteVersion(versionId: string): void;
}

export function GalleryCard({
  family,
  onOpen,
  onFeature,
  onDuplicate,
  onRemix,
  onExport,
  onFavourite,
  onDelete,
  onDeleteVersion,
}: GalleryCardProps) {
  const live = useMemo(
    () => family.versions.filter((version) => version.deletedAt === undefined),
    [family.versions],
  );
  const [selectedId, setSelectedId] = useState<string>();
  const selected = live.find(
    (version) => version.id === (selectedId ?? family.featuredVersionId),
  ) ?? live.at(-1);
  const visibility = useVisible<HTMLElement>();
  const src = useGalleryPreviewSrc(family.id, visibility.visible ? selected?.id : undefined);
  if (!selected) return null;

  return (
    <article ref={visibility.ref} className="gallery-card border-border bg-card overflow-hidden rounded-lg border">
      <div className="bg-muted aspect-video relative overflow-hidden">
        {src ? (
          <img src={src} alt="" loading="lazy" className="size-full object-cover object-top" />
        ) : (
          <span className="text-muted-foreground flex size-full items-center justify-center">
            <ImageOff className="size-5" />
          </span>
        )}
        <span className="bg-background/90 absolute top-2 right-2 rounded px-2 py-1 text-xs font-medium">
          {selected.id === family.featuredVersionId ? 'Featured · ' : ''}V{live.indexOf(selected) + 1}
        </span>
        <button
          type="button"
          className="bg-background/90 absolute top-2 left-2 flex size-7 items-center justify-center rounded"
          aria-label={family.favourite ? 'Remove from favourites' : 'Add to favourites'}
          onClick={() => onFavourite(!family.favourite)}
        >
          <Heart className={`size-3.5 ${family.favourite ? 'text-primary fill-current' : ''}`} />
        </button>
      </div>

      <div className="space-y-3 p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{family.title}</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              {selected.target === 'html' ? 'HTML prototype' : 'React prototype'} · saved {relativeTime(selected.createdAt, Date.now())}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="ghost" aria-label="Gallery family actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onDuplicate(selected.id)}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onRemix(selected.id)}>Remix</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExport(selected.id, 'downloads')}>Export to Downloads</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExport(selected.id, 'workspace')}>Export to workspace</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onDeleteVersion(selected.id)}>Delete version</DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete}>Delete family</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Version</span>
          <Select value={selected.id} onValueChange={setSelectedId}>
            <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Version">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {live.map((version, index) => (
                <SelectItem key={version.id} value={version.id}>
                  V{index + 1} · {version.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected.id !== family.featuredVersionId && (
            <Button type="button" size="sm" variant="outline" onClick={() => onFeature(selected.id)}>
              Feature
            </Button>
          )}
          <Button
            type="button"
            size="icon-sm"
            aria-label="Open Design"
            title="Open Design"
            onClick={() => onOpen(selected.id)}
          >
            <SquareArrowOutUpRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}
