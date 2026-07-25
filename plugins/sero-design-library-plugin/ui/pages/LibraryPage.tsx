import { Badge } from '@sero-ai/ui/components/ui/badge.js';
import { Button } from '@sero-ai/ui/components/ui/button.js';
import { Input } from '@sero-ai/ui/components/ui/input.js';
import { cn } from '@sero-ai/ui/lib/utils.js';
import {
  Check,
  ChevronDown,
  Clock3,
  Filter,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LibraryFixture } from '../fixtures';
import { ArtworkPreview } from '../components/ArtworkPreview';
import { SurfaceState } from '../components/SurfaceState';

interface LibraryPageProps {
  items: LibraryFixture[];
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  onCreateDesign: () => void;
}

const FILTERS = ['Tags', 'Colours', 'Source', 'Status', 'Date'];

export function LibraryPage({
  items,
  selectedIds,
  onToggleSelection,
  onCreateDesign,
}: LibraryPageProps) {
  const [query, setQuery] = useState('');
  const filteredItems = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase();
    if (!normalisedQuery) return items;
    return items.filter((item) =>
      [item.title, item.primaryStyle, item.source, ...item.tags]
        .join(' ')
        .toLowerCase()
        .includes(normalisedQuery),
    );
  }, [items, query]);

  return (
    <div className="dl-page dl-library">
      <aside className="dl-sidebar">
        <div className="dl-sidebar__title">Library</div>
        <SidebarRow active count={items.length} icon={<Sparkles size={14} />} label="All inspiration" />
        <SidebarRow
          count={items.filter((item) => item.analysisStatus === 'analysing').length}
          icon={<Clock3 size={14} />}
          label="Awaiting analysis"
        />
        <SidebarRow count={items.length} icon={<Clock3 size={14} />} label="Recently added" />

        <div className="dl-sidebar__title dl-sidebar__title--spaced">Analysis</div>
        <div className="dl-sidebar__summary">
          <span><i className="dl-dot dl-dot--ready" /> Ready</span>
          <strong>{items.filter((item) => item.analysisStatus === 'ready').length}</strong>
        </div>
        <div className="dl-sidebar__summary">
          <span><i className="dl-dot dl-dot--running" /> In progress</span>
          <strong>{items.filter((item) => item.analysisStatus === 'analysing').length}</strong>
        </div>
        <div className="dl-sidebar__summary">
          <span><i className="dl-dot dl-dot--error" /> Needs attention</span>
          <strong>{items.filter((item) => item.analysisStatus === 'failed').length}</strong>
        </div>
      </aside>

      <main className="dl-main">
        <div className="dl-toolbar">
          <label className="dl-search">
            <Search aria-hidden="true" size={15} />
            <Input
              aria-label="Search inspiration"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search names, tags, notes and analysis"
              value={query}
            />
          </label>
          <div className="dl-filter-row" aria-label="Library filters">
            {FILTERS.map((filter) => (
              <Button key={filter} size="sm" variant="outline">
                {filter}
                <ChevronDown aria-hidden="true" size={13} />
              </Button>
            ))}
          </div>
          <Button aria-label="Filter settings" size="icon-sm" variant="ghost">
            <SlidersHorizontal size={15} />
          </Button>
        </div>

        <div className="dl-content">
          {selectedIds.length > 0 ? (
            <div className="dl-selection-bar">
              <div className="dl-selection-stack">
                {selectedIds.slice(0, 4).map((id) => {
                  const item = items.find((candidate) => candidate.id === id);
                  return item ? <ArtworkPreview compact key={id} kind={item.previewKind} /> : null;
                })}
              </div>
              <div>
                <strong>{selectedIds.length} {selectedIds.length === 1 ? 'reference' : 'references'} selected</strong>
                <span>The first selection leads the visual direction.</span>
              </div>
              <Button onClick={onCreateDesign} size="sm">
                Create Design
              </Button>
            </div>
          ) : null}

          {filteredItems.length === 0 ? (
            <SurfaceState
              detail="Try a different name, tag, source or analysis term."
              kind="empty"
              title="No inspiration found"
            />
          ) : (
            <div className="dl-library-grid">
              {filteredItems.map((item) => {
                const selectedIndex = selectedIds.indexOf(item.id);
                const isSelected = selectedIndex >= 0;
                return (
                  <article
                    className={cn('dl-library-card', isSelected && 'dl-library-card--selected')}
                    key={item.id}
                  >
                    <button
                      aria-label={`${isSelected ? 'Remove' : 'Select'} ${item.title}`}
                      aria-pressed={isSelected}
                      className="dl-library-card__select"
                      onClick={() => onToggleSelection(item.id)}
                      type="button"
                    >
                      {isSelected ? <Check size={14} /> : null}
                    </button>
                    {isSelected ? (
                      <span className="dl-library-card__order">
                        {selectedIndex === 0 ? 'Primary' : selectedIndex + 1}
                      </span>
                    ) : null}
                    <ArtworkPreview kind={item.previewKind} />
                    <div className="dl-library-card__copy">
                      <div className="dl-library-card__title">
                        <StatusDot status={item.analysisStatus} />
                        <strong>{item.title}</strong>
                      </div>
                      <span>{analysisLabel(item.analysisStatus, item.primaryStyle)}</span>
                      <div className="dl-tag-row">
                        {item.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

interface SidebarRowProps {
  active?: boolean;
  count: number;
  icon: React.ReactNode;
  label: string;
}

function SidebarRow({ active = false, count, icon, label }: SidebarRowProps) {
  return (
    <button className={cn('dl-sidebar__row', active && 'dl-sidebar__row--active')} type="button">
      {icon}
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

function StatusDot({ status }: { status: LibraryFixture['analysisStatus'] }) {
  return <i className={`dl-dot dl-dot--${status}`} title={status} />;
}

function analysisLabel(status: LibraryFixture['analysisStatus'], primaryStyle: string): string {
  if (status === 'analysing') return 'Librarian analysing…';
  if (status === 'failed') return 'Analysis needs attention';
  return primaryStyle;
}
