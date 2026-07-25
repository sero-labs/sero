import { MAX_DESIGN_REFERENCES } from './defaults';
import type {
  EditableLibrarianProfile,
  GalleryFamily,
  LibrarianField,
  LibrarianUserFacingAnalysis,
  LibraryReferenceSource,
  OrderedDesignReference,
} from './types';

export function createOrderedReferences(
  sources: LibraryReferenceSource[],
): OrderedDesignReference[] {
  if (sources.length > MAX_DESIGN_REFERENCES) {
    throw new Error(`A Design supports at most ${MAX_DESIGN_REFERENCES} references.`);
  }

  const identities = sources.map(referenceIdentity);
  if (new Set(identities).size !== identities.length) {
    throw new Error('A Design cannot contain the same Library reference twice.');
  }

  return sources.map((source, position) => ({
    position,
    role: position === 0 ? 'primary' : 'secondary',
    source,
  }));
}

export function resolveLibrarianField<TField extends LibrarianField>(
  profile: EditableLibrarianProfile,
  field: TField,
): LibrarianUserFacingAnalysis[TField] {
  const override = profile.overrides[field];
  if (override !== undefined) {
    return override.value;
  }
  return profile.generated[field];
}

export function validateGalleryFamily(family: GalleryFamily): string[] {
  const errors: string[] = [];
  if (family.versionIds.length === 0) {
    errors.push('A Gallery family must contain at least one version.');
  }
  if (!family.versionIds.includes(family.featuredVersionId)) {
    errors.push('The featured Gallery version must belong to its family.');
  }
  if (new Set(family.versionIds).size !== family.versionIds.length) {
    errors.push('A Gallery family cannot contain a version more than once.');
  }
  return errors;
}

function referenceIdentity(source: LibraryReferenceSource): string {
  return source.kind === 'live' ? source.itemId : source.sourceItemId;
}
