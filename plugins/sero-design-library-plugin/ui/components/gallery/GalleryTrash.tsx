import { Button } from '@sero-ai/ui';

import type { GalleryFamilyRecord } from '../../../shared/gallery';
import type { GalleryActions } from '../../hooks/useGallery';
import { useGalleryPreviewSrc } from '../../hooks/useAssetSrc';
import { useVisible } from '../../hooks/useVisible';

export function GalleryTrash({
  families,
  query,
  actions,
}: {
  families: GalleryFamilyRecord[];
  query: string;
  actions: GalleryActions;
}) {
  const entries = families.flatMap<TrashEntry>((family) =>
    family.deletedAt !== undefined
      ? [{ kind: 'family', family }]
      : family.versions.flatMap((version) =>
          version.deletedAt === undefined ? [] : [{ kind: 'version', family, version }],
        ),
  );
  if (entries.length === 0) {
    return <p className="text-muted-foreground px-6 py-24 text-center text-sm">Gallery Trash is empty.</p>;
  }
  const needle = query.trim().toLowerCase();
  const visible = needle === ''
    ? entries
    : entries.filter(
        (entry) =>
          entry.family.title.toLowerCase().includes(needle) ||
          (entry.kind === 'version' && entry.version.title.toLowerCase().includes(needle)),
      );
  if (visible.length === 0) {
    return (
      <p className="text-muted-foreground px-6 py-24 text-center text-sm">
        No Gallery Trash entry matches.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 p-5">
      {visible.map((entry) => (
        <TrashCard
          key={entry.kind === 'family' ? entry.family.id : entry.version.id}
          entry={entry}
          actions={actions}
        />
      ))}
    </div>
  );
}

type TrashEntry =
  | { kind: 'family'; family: GalleryFamilyRecord }
  | { kind: 'version'; family: GalleryFamilyRecord; version: GalleryFamilyRecord['versions'][number] };

function TrashCard({
  entry,
  actions,
}: {
  entry: TrashEntry;
  actions: GalleryActions;
}) {
  const version = entry.kind === 'version'
    ? entry.version
    : entry.family.versions.find((candidate) => candidate.id === entry.family.featuredVersionId) ??
      entry.family.versions.at(-1);
  const visibility = useVisible<HTMLElement>();
  const src = useGalleryPreviewSrc(entry.family.id, visibility.visible ? version?.id : undefined);
  return (
    <article ref={visibility.ref} className="gallery-card border-border bg-card overflow-hidden rounded-lg border">
      <div className="bg-muted aspect-4/3">
        {src && <img src={src} alt="" className="size-full object-cover object-top opacity-70" />}
      </div>
      <div className="space-y-3 p-3">
        <div>
          <h3 className="truncate text-sm font-semibold">{entry.family.title}</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {entry.kind === 'family' ? 'Deleted family' : `Deleted version · ${entry.version.title}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void (entry.kind === 'family'
              ? actions.restoreFamily(entry.family.id)
              : actions.restoreVersion(entry.family.id, entry.version.id))}
          >
            Restore
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => void (entry.kind === 'family'
              ? actions.purgeFamily(entry.family.id)
              : actions.purgeVersion(entry.family.id, entry.version.id))}
          >
            Delete permanently
          </Button>
        </div>
      </div>
    </article>
  );
}
