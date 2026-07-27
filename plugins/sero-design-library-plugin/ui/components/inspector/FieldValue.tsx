import { Badge } from '@sero-ai/ui';

import type {
  LibrarianField,
  LibrarianPaletteEntry,
  LibrarianUserFacingAnalysis,
  LibrarianVisualProfile,
  LibrarianVocabularyTerm,
} from '../../../shared/librarian';
import { FIELD_SHAPES, PROFILE_GROUPS, PROFILE_GROUP_LABELS } from '../../lib/field-codecs';

/**
 * How each field reads when it is not being edited.
 *
 * The prototype governs this: the palette is one continuous band rather than a
 * row of labelled chips, construction is a compact card grid, and vocabulary
 * is a term list. The point is that a reference should be scannable at a
 * glance, not read like a form.
 */

function Empty() {
  return <p className="text-muted-foreground text-sm">—</p>;
}

export function FieldValue({
  field,
  value,
}: {
  field: LibrarianField;
  value: LibrarianUserFacingAnalysis[LibrarianField];
}) {
  switch (FIELD_SHAPES[field]) {
    case 'line': {
      const text = typeof value === 'string' ? value : '';
      if (text === '') return <Empty />;
      // The primary style is the reference's headline, so it carries weight.
      const emphasised = field === 'primaryStyle' || field === 'title';
      return (
        <p className={emphasised ? 'text-sm font-medium' : 'text-sm'}>{text}</p>
      );
    }

    case 'paragraph': {
      const text = typeof value === 'string' ? value : '';
      return text === '' ? (
        <Empty />
      ) : (
        <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
      );
    }

    case 'list': {
      const entries = Array.isArray(value) ? (value as string[]) : [];
      if (entries.length === 0) return <Empty />;
      return (
        <div className="flex flex-wrap gap-1">
          {entries.map((entry) => (
            <Badge key={entry} variant="outline" className="font-normal">
              {entry}
            </Badge>
          ))}
        </div>
      );
    }

    case 'vocabulary': {
      const terms = (value ?? []) as LibrarianVocabularyTerm[];
      if (terms.length === 0) return <Empty />;
      return (
        <dl className="space-y-1">
          {terms.map((entry) => (
            <div key={entry.term} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <dt className="font-medium">{entry.term}</dt>
              {entry.meaning && <dd className="text-muted-foreground">{entry.meaning}</dd>}
            </div>
          ))}
        </dl>
      );
    }

    case 'palette': {
      const swatches = (value ?? []) as LibrarianPaletteEntry[];
      if (swatches.length === 0) return <Empty />;
      return (
        <div className="border-border flex h-9 overflow-hidden rounded-md border">
          {swatches.map((entry) => (
            <span
              key={`${entry.hex}-${entry.role}`}
              className="flex-1"
              style={{ backgroundColor: entry.hex }}
              title={entry.role ? `${entry.role} · ${entry.hex}` : entry.hex}
            />
          ))}
        </div>
      );
    }

    case 'profile': {
      const profile = (value ?? {}) as LibrarianVisualProfile;
      const groups = PROFILE_GROUPS.filter((group) => (profile[group] ?? []).length > 0);
      if (groups.length === 0) return <Empty />;
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group} className="border-border rounded-md border p-2.5">
              <p className="text-xs font-medium tracking-wide uppercase">
                {PROFILE_GROUP_LABELS[group]}
              </p>
              <p className="text-muted-foreground mt-1 text-sm leading-snug">
                {profile[group].join(' · ')}
              </p>
            </div>
          ))}
        </div>
      );
    }
  }
}
