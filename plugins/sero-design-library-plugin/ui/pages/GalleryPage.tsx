import { Badge, Button } from '@sero-ai/ui';
import { ChevronDown, Copy, ExternalLink, Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { ArtworkPreview } from '../components/ArtworkPreview';
import type { GalleryFamilyFixture } from '../fixtures';

interface GalleryPageProps {
  families: GalleryFamilyFixture[];
}

export function GalleryPage({ families }: GalleryPageProps) {
  const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({});

  return (
    <div className="dl-page dl-gallery">
      <main className="dl-gallery__main">
        <div className="dl-gallery__hero">
          <div>
            <span className="dl-eyebrow">Private creative archive</span>
            <h1>Your Gallery</h1>
            <p>Finished work worth keeping, revisiting and remixing.</p>
          </div>
          <div className="dl-gallery__metric">
            <strong>{families.length}</strong>
            <span>Design families</span>
          </div>
        </div>

        <div className="dl-gallery__toolbar">
          <label className="dl-search">
            <Search aria-hidden="true" size={15} />
            <input aria-label="Search Gallery" placeholder="Search designs and provenance" />
          </label>
          <Button size="sm" variant="outline">Output target <ChevronDown size={13} /></Button>
          <Button size="sm" variant="outline">Date <ChevronDown size={13} /></Button>
        </div>

        <div className="dl-gallery-grid">
          {families.map((family) => {
            const selectedVersionId = selectedVersions[family.id] ?? family.featuredVersionId;
            const version = family.versions.find((candidate) => candidate.id === selectedVersionId)
              ?? family.versions[0];
            if (!version) return null;

            return (
              <article className="dl-gallery-card" key={family.id}>
                <div className="dl-gallery-card__preview">
                  <ArtworkPreview kind={version.previewKind} />
                  <Badge className="dl-gallery-card__version">{version.label}</Badge>
                  {version.id === family.featuredVersionId ? (
                    <Badge className="dl-gallery-card__featured"><Sparkles size={11} /> Featured</Badge>
                  ) : null}
                </div>
                <div className="dl-gallery-card__copy">
                  <div className="dl-gallery-card__title">
                    <div>
                      <span>{family.title}</span>
                      <strong>{version.title}</strong>
                    </div>
                    <Button aria-label={`Open ${version.title}`} size="icon-sm" variant="ghost">
                      <ExternalLink size={15} />
                    </Button>
                  </div>
                  <div className="dl-gallery-card__meta">
                    <span>{version.outputTarget === 'html' ? 'HTML prototype' : 'React + Tailwind'}</span>
                    <span>{family.referenceCount} inspirations</span>
                    <span>{family.versions.length} {family.versions.length === 1 ? 'version' : 'versions'}</span>
                  </div>
                  <div className="dl-gallery-card__actions">
                    <label>
                      <span className="sr-only">Choose {family.title} version</span>
                      <select
                        onChange={(event) =>
                          setSelectedVersions((current) => ({
                            ...current,
                            [family.id]: event.target.value,
                          }))
                        }
                        value={selectedVersionId}
                      >
                        {family.versions.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.label} · {candidate.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button size="sm" variant="ghost"><Copy size={13} /> Remix</Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
