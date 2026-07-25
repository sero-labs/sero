import { Badge, Button, cn } from '@sero-ai/ui';
import {
  AlertTriangle,
  Check,
  CircleX,
  Code2,
  FileCode2,
  History,
  LoaderCircle,
  Maximize2,
  Monitor,
  RotateCcw,
  Save,
  Smartphone,
  Tablet,
} from 'lucide-react';
import { useState } from 'react';
import { ArtworkPreview } from '../components/ArtworkPreview';
import { SurfaceState } from '../components/SurfaceState';
import type { VariantFixture } from '../fixtures';

interface DesignPageProps {
  variants: VariantFixture[];
}

export function DesignPage({ variants }: DesignPageProps) {
  const [activeVariantId, setActiveVariantId] = useState(variants[0]?.id);
  const activeVariant = variants.find((variant) => variant.id === activeVariantId) ?? variants[0];

  if (!activeVariant) {
    return (
      <div className="dl-page dl-page--centred">
        <SurfaceState
          actionLabel="Create Design"
          detail="Select one to six Library references to begin."
          kind="empty"
          title="No active Design"
        />
      </div>
    );
  }

  return (
    <div className="dl-page dl-design">
      <aside className="dl-design-list">
        <div className="dl-sidebar__title">Designs</div>
        <button className="dl-design-list__item dl-design-list__item--active" type="button">
          <strong>Agent operations</strong>
          <span>4 variants · just now</span>
        </button>
        <button className="dl-design-list__item" type="button">
          <strong>Portfolio overview</strong>
          <span>2 variants · yesterday</span>
        </button>
        <button className="dl-design-list__item" type="button">
          <strong>Command palette study</strong>
          <span>3 variants · 22 Jul</span>
        </button>
        <div className="dl-sidebar__title dl-sidebar__title--spaced">Active jobs</div>
        <div className="dl-job-summary">
          <LoaderCircle className="dl-spin" size={14} />
          <div><strong>Glass telemetry</strong><span>Building local output</span></div>
        </div>
      </aside>

      <main className="dl-workbench">
        <div className="dl-variant-tabs" role="tablist">
          {variants.map((variant, index) => (
            <button
              aria-selected={variant.id === activeVariant.id}
              className={cn('dl-variant-tab', variant.id === activeVariant.id && 'dl-variant-tab--active')}
              key={variant.id}
              onClick={() => setActiveVariantId(variant.id)}
              role="tab"
              type="button"
            >
              <VariantIcon status={variant.status} />
              <span>{String(index + 1).padStart(2, '0')} {variant.title}</span>
            </button>
          ))}
        </div>

        <div className="dl-canvas-toolbar">
          <span>Fit · 83%</span>
          <div>
            <Button aria-label="Desktop preview" size="icon-sm" variant="secondary"><Monitor size={14} /></Button>
            <Button aria-label="Tablet preview" size="icon-sm" variant="ghost"><Tablet size={14} /></Button>
            <Button aria-label="Mobile preview" size="icon-sm" variant="ghost"><Smartphone size={14} /></Button>
          </div>
          <div>
            <Button aria-label="Refresh preview" size="icon-sm" variant="ghost"><RotateCcw size={14} /></Button>
            <Button aria-label="Expand preview" size="icon-sm" variant="ghost"><Maximize2 size={14} /></Button>
          </div>
        </div>

        {activeVariant.status === 'warning' ? (
          <div className="dl-inline-notice dl-inline-notice--warning">
            <AlertTriangle size={15} />
            <span><strong>2 restricted capabilities blocked.</strong> Safe output remains visible.</span>
            <Button size="sm" variant="ghost">View warnings</Button>
          </div>
        ) : null}

        <div className="dl-canvas-layout">
          <section className="dl-canvas">
            {activeVariant.status === 'failed' ? (
              <SurfaceState
                actionLabel="Retry variant"
                detail="Completed variants remain available. This direction can retry independently."
                kind="error"
                title="Variant generation failed"
              />
            ) : activeVariant.status === 'running' ? (
              <div className="dl-preview-frame dl-preview-frame--loading">
                <ArtworkPreview kind={activeVariant.previewKind} />
                <SurfaceState
                  detail="The job continues if you leave this page."
                  kind="loading"
                  title="Generating local output"
                />
              </div>
            ) : (
              <div className="dl-preview-frame">
                <ArtworkPreview kind={activeVariant.previewKind} />
                <div className="dl-preview-frame__metrics">
                  <span><small>Active tasks</small><strong>1,284</strong></span>
                  <span><small>Success rate</small><strong>98.7%</strong></span>
                  <span><small>Incidents</small><strong>07</strong></span>
                </div>
              </div>
            )}
          </section>

          <aside className="dl-inspector">
            <div className="dl-inspector__head">
              <span>Variant {activeVariant.status}</span>
              <h2>{activeVariant.title}</h2>
            </div>
            <div className="dl-inspector__tabs">
              <button className="dl-inspector__tab dl-inspector__tab--active" type="button"><Code2 size={13} /> Design</button>
              <button className="dl-inspector__tab" type="button"><FileCode2 size={13} /> Files</button>
              <button className="dl-inspector__tab" type="button"><History size={13} /> History</button>
            </div>
            <InspectorSection title="Concept">
              <p>{activeVariant.concept}</p>
            </InspectorSection>
            <InspectorSection title="Inspiration">
              <div className="dl-inspiration-strip">
                <ArtworkPreview compact kind="signal" />
                <ArtworkPreview compact kind="editorial" />
                <ArtworkPreview compact kind="glass" />
              </div>
            </InspectorSection>
            <InspectorSection title="Applied language">
              <div className="dl-tag-row">
                <Badge variant="secondary">instrumental</Badge>
                <Badge variant="secondary">editorial scale</Badge>
                <Badge variant="secondary">restrained</Badge>
              </div>
            </InspectorSection>
            <InspectorSection title="Output">
              <div className="dl-file-row"><FileCode2 size={13} /> index.html <span>8.2 KB</span></div>
              <div className="dl-file-row"><FileCode2 size={13} /> styles.css <span>12.4 KB</span></div>
              <div className="dl-file-row"><FileCode2 size={13} /> script.js <span>1.8 KB</span></div>
            </InspectorSection>
          </aside>
        </div>

        <div className="dl-revise">
          <div>Ask Sero to revise this variant…</div>
          <Button variant="outline">Revise</Button>
          <Button><Save size={14} /> Save to Gallery</Button>
        </div>
      </main>
    </div>
  );
}

function VariantIcon({ status }: { status: VariantFixture['status'] }) {
  if (status === 'ready') return <Check className="dl-status-ready" size={13} />;
  if (status === 'running') return <LoaderCircle className="dl-spin dl-status-running" size={13} />;
  if (status === 'warning') return <AlertTriangle className="dl-status-warning" size={13} />;
  return <CircleX className="dl-status-error" size={13} />;
}

function InspectorSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="dl-inspector__section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
