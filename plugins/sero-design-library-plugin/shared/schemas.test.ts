import { describe, expect, it } from 'vitest';
import type {
  EditableLibrarianProfile,
  GalleryFamily,
  LibrarianAnalysis,
  LibrarianOverrides,
} from './types';
import {
  createOrderedReferences,
  resolveLibrarianField,
  validateGalleryFamily,
} from './schemas';

describe('Design Library schema invariants', () => {
  it('keeps reference order explicit and assigns the first reference as primary', () => {
    const references = createOrderedReferences([
      { kind: 'live', itemId: 'first' },
      { kind: 'live', itemId: 'second' },
      {
        kind: 'tombstone',
        sourceItemId: 'third',
        title: 'Deleted source',
        primaryStyle: 'Editorial',
        tags: ['warm'],
        deletedAt: 3,
      },
    ]);

    expect(references.map((reference) => reference.position)).toEqual([0, 1, 2]);
    expect(references.map((reference) => reference.role)).toEqual([
      'primary',
      'secondary',
      'secondary',
    ]);
  });

  it('rejects duplicate references and more than six references', () => {
    expect(() =>
      createOrderedReferences([
        { kind: 'live', itemId: 'same' },
        { kind: 'live', itemId: 'same' },
      ]),
    ).toThrow('same Library reference twice');

    expect(() =>
      createOrderedReferences(
        Array.from({ length: 7 }, (_, index) => ({
          kind: 'live' as const,
          itemId: `item-${index}`,
        })),
      ),
    ).toThrow('at most 6 references');
  });

  it('uses override presence even when the override value is empty', () => {
    const generated = createAnalysis();
    const overrides: LibrarianOverrides = {
      notes: {
        field: 'notes',
        value: '',
        updatedAt: 2,
      },
      tags: {
        field: 'tags',
        value: [],
        updatedAt: 2,
      },
    };
    const profile: EditableLibrarianProfile = { generated, overrides };

    expect(resolveLibrarianField(profile, 'notes')).toBe('');
    expect(resolveLibrarianField(profile, 'tags')).toEqual([]);
    expect(resolveLibrarianField(profile, 'title')).toBe('Generated title');
  });

  it('requires a Gallery featured version to belong to the family', () => {
    const family: GalleryFamily = {
      id: 'family',
      title: 'Family',
      versionIds: ['version-1'],
      featuredVersionId: 'missing',
      createdAt: 1,
      updatedAt: 1,
    };

    expect(validateGalleryFamily(family)).toEqual([
      'The featured Gallery version must belong to its family.',
    ]);
  });
});

function createAnalysis(): LibrarianAnalysis {
  return {
    schemaVersion: 1,
    title: 'Generated title',
    notes: 'Generated notes',
    designTypes: ['Web application'],
    primaryStyle: 'Technical monochrome',
    tags: ['precise'],
    summary: 'A concise summary.',
    designIntent: 'A clear intent.',
    aestheticVocabulary: [{ term: 'instrumental' }],
    visualProfile: {
      colour: [],
      typography: [],
      layout: [],
      spacingAndDensity: [],
      shapeLanguage: [],
      surfaces: [],
      imagery: [],
      motion: [],
    },
    always: [],
    never: [],
    generationPrompt: 'Create an original interface.',
    confidence: 0.9,
    provenance: {
      analysedAt: 1,
      promptVersion: 1,
    },
  };
}
