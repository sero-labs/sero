/**
 * Gallery — one card per family, showing its featured version.
 *
 * Every version is an immutable snapshot. Featuring, reopening, duplicating
 * and deleting never mutate a saved version.
 */

import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui';
import { Copy, Download, ExternalLink, Star } from 'lucide-react';
import type { GalleryFamilySummary } from '../../shared/state';
import { SurfaceState } from '../components/SurfaceState';
import { VersionThumbnail } from '../components/VersionThumbnail';
import type { DesignLibraryActions } from '../runtime';

export interface GalleryPageProps {
  families: GalleryFamilySummary[];
  actions: DesignLibraryActions;
  showDeleted: boolean;
  onToggleDeleted: (value: boolean) => void;
}

export function GalleryPage({ families, actions, showDeleted, onToggleDeleted }: GalleryPageProps) {
  const visible = families.filter((family) =>
    showDeleted ? family.deletedAt !== undefined : family.deletedAt === undefined);

  return (
    <div className="dl-page">
      <div className="dl-gallery__main">
        <div className="dl-gallery__hero">
          <div>
            <h2>Your Gallery</h2>
            <p className="dl-eyebrow">Finished work worth keeping, revisiting and remixing.</p>
          </div>
          <span className="dl-gallery__metric">{visible.length} families</span>
        </div>

        <div className="dl-gallery__toolbar">
          <div className="dl-filter-toggle">
            <Checkbox
              checked={showDeleted}
              id="dl-gallery-deleted"
              onCheckedChange={(checked) => onToggleDeleted(checked === true)}
            />
            <Label htmlFor="dl-gallery-deleted">Deleted</Label>
          </div>
        </div>

        {visible.length === 0 ? (
          <SurfaceState
            detail={showDeleted
              ? 'Nothing has been deleted from the Gallery.'
              : 'Save a variant from the Design workbench to start your Gallery.'}
            kind="empty"
            title={showDeleted ? 'No deleted versions' : 'Your Gallery is empty'}
          />
        ) : (
          <div className="dl-gallery-grid">
            {visible.map((family) => (
              <FamilyCard actions={actions} family={family} key={family.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FamilyCard({ family, actions }: { family: GalleryFamilySummary; actions: DesignLibraryActions }) {
  const [selectedVersionId, setSelectedVersionId] = useState(family.featuredVersionId);
  const live = family.versions.filter((version) => version.deletedAt === undefined);
  const selected = family.versions.find((version) => version.id === selectedVersionId)
    ?? family.versions.find((version) => version.id === family.featuredVersionId);

  return (
    <article className="dl-gallery-card">
      <div className="dl-gallery-card__preview">
        <VersionThumbnail
          actions={actions}
          familyId={family.id}
          title={family.title}
          versionId={selectedVersionId}
        />
      </div>

      <div className="dl-gallery-card__copy">
        <h3 className="dl-gallery-card__title">{family.title}</h3>
        <div className="dl-gallery-card__meta">
          <Select onValueChange={setSelectedVersionId} value={selectedVersionId}>
            <SelectTrigger
              aria-label="Version"
              className="dl-gallery-card__version"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {live.map((version, index) => (
                <SelectItem key={version.id} value={version.id}>
                  v{index + 1} · {new Date(version.createdAt).toLocaleDateString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedVersionId === family.featuredVersionId ? (
            <Badge className="dl-gallery-card__featured" variant="secondary">
              <Star aria-hidden="true" size={11} /> Featured
            </Badge>
          ) : null}
        </div>

        <div className="dl-gallery-card__actions">
          <Button
            onClick={() => void actions.galleryAction('feature', {
              familyId: family.id,
              versionId: selectedVersionId,
            })}
            size="sm"
            variant="ghost"
          >
            <Star aria-hidden="true" size={13} /> Feature
          </Button>
          <Button
            onClick={() => void actions.galleryAction('remix', {
              familyId: family.id,
              versionId: selectedVersionId,
              request: family.title,
            })}
            size="sm"
            variant="ghost"
          >
            <ExternalLink aria-hidden="true" size={13} /> Remix
          </Button>
          <Button
            onClick={() => void actions.galleryAction('duplicate', {
              familyId: family.id,
              versionId: selectedVersionId,
            })}
            size="sm"
            variant="ghost"
          >
            <Copy aria-hidden="true" size={13} /> Duplicate
          </Button>
          <Button
            onClick={() => void actions.exportVersion(family.id, selectedVersionId, 'downloads')}
            size="sm"
            variant="ghost"
          >
            <Download aria-hidden="true" size={13} /> Downloads
          </Button>
          <Button
            onClick={() => void actions.exportVersion(family.id, selectedVersionId, 'workspace')}
            size="sm"
            variant="ghost"
          >
            <Download aria-hidden="true" size={13} /> Workspace
          </Button>
          {family.deletedAt === undefined ? (
            <Button
              onClick={() => void actions.galleryAction('delete', { familyId: family.id })}
              size="sm"
              variant="ghost"
            >
              Delete
            </Button>
          ) : (
            <>
              <Button
                onClick={() => void actions.galleryAction('restore', { familyId: family.id })}
                size="sm"
                variant="ghost"
              >
                Restore
              </Button>
              <Button
                onClick={() => void actions.galleryAction('purge', { familyId: family.id })}
                size="sm"
                variant="destructive"
              >
                Delete permanently
              </Button>
            </>
          )}
        </div>

        <p className="dl-eyebrow">{selected?.outputTarget === 'react-tailwind' ? 'React + Tailwind' : 'HTML'}</p>
      </div>
    </article>
  );
}
