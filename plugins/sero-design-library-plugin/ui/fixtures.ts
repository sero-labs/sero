import type {
  AnalysisStatus,
  GalleryFamily,
  GalleryVersion,
  LibraryItemSummary,
  OutputTarget,
} from '../shared/types';

export type PreviewKind =
  | 'signal'
  | 'editorial'
  | 'glass'
  | 'brutal'
  | 'data'
  | 'mobile'
  | 'kinetic'
  | 'luxury';

export interface LibraryFixture extends LibraryItemSummary {
  previewKind: PreviewKind;
}

export interface VariantFixture {
  id: string;
  title: string;
  status: 'ready' | 'running' | 'warning' | 'failed';
  outputTarget: OutputTarget;
  previewKind: PreviewKind;
  concept: string;
}

export interface GalleryFamilyFixture extends GalleryFamily {
  versions: Array<GalleryVersion & { previewKind: PreviewKind; label: string }>;
  referenceCount: number;
}

const JULY_25_2026 = Date.UTC(2026, 6, 25, 11, 0, 0);

export const LIBRARY_FIXTURES: LibraryFixture[] = [
  libraryItem('northstar', 'Northstar operations', 'Technical monochrome', ['data-dense', 'precise', 'emerald'], 'signal', 'ready'),
  libraryItem('material', 'Material journal', 'Contemporary editorial', ['overscale type', 'warm', 'tactile'], 'editorial', 'ready'),
  libraryItem('command', 'Layered command centre', 'Spatial glass', ['depth', 'restrained', 'layered'], 'glass', 'ready'),
  libraryItem('archive', 'Signal archive', 'Neo-brutalist', ['hard geometry', 'acid', 'graphic'], 'brutal', 'ready'),
  libraryItem('climate', 'Climate index', 'Analytical minimalism', ['calm', 'structured', 'clear'], 'data', 'ready'),
  libraryItem('finance', 'Evening finance', 'Chromatic mobile', ['mobile', 'ambient', 'compact'], 'mobile', 'analysing'),
  libraryItem('kinetic', 'Kinetic identity', 'Retro-futurist', ['optical', 'rhythmic', 'mono'], 'kinetic', 'failed'),
  libraryItem('atelier', 'Atelier product study', 'Dark luxury', ['restrained', 'metallic', 'precise'], 'luxury', 'ready'),
];

export const VARIANT_FIXTURES: VariantFixture[] = [
  {
    id: 'signal-ledger',
    title: 'Signal ledger',
    status: 'ready',
    outputTarget: 'html',
    previewKind: 'signal',
    concept: 'A typography-led operations dashboard with restrained colour and exact geometry.',
  },
  {
    id: 'operational-field',
    title: 'Operational field',
    status: 'warning',
    outputTarget: 'html',
    previewKind: 'editorial',
    concept: 'An editorial system view that makes incidents obvious without becoming noisy.',
  },
  {
    id: 'glass-telemetry',
    title: 'Glass telemetry',
    status: 'running',
    outputTarget: 'html',
    previewKind: 'glass',
    concept: 'A layered telemetry workspace with selective depth and calm hierarchy.',
  },
  {
    id: 'quiet-grid',
    title: 'Quiet grid',
    status: 'failed',
    outputTarget: 'html',
    previewKind: 'data',
    concept: 'A minimal data field awaiting an independent retry.',
  },
];

export const GALLERY_FIXTURES: GalleryFamilyFixture[] = [
  galleryFamily('agent-operations', 'Agent operations dashboard', 3, [
    galleryVersion('agent-v3', 'Signal ledger', 'V3', 'signal', 'html'),
    galleryVersion('agent-v2', 'Operational field', 'V2', 'editorial', 'html'),
    galleryVersion('agent-v1', 'Glass telemetry', 'V1', 'glass', 'html'),
  ]),
  galleryFamily('editorial-portfolio', 'Editorial portfolio', 2, [
    galleryVersion('editorial-v2', 'Material index', 'V2', 'editorial', 'react-tailwind'),
    galleryVersion('editorial-v1', 'Hard copy', 'V1', 'brutal', 'react-tailwind'),
  ]),
  galleryFamily('market-intelligence', 'Market intelligence', 1, [
    galleryVersion('market-v1', 'Climate index', 'V1', 'data', 'html'),
  ]),
  galleryFamily('atelier-study', 'Atelier study', 2, [
    galleryVersion('atelier-v2', 'Obsidian object', 'V2', 'luxury', 'react-tailwind'),
    galleryVersion('atelier-v1', 'Evening object', 'V1', 'mobile', 'react-tailwind'),
  ]),
];

function libraryItem(
  id: string,
  title: string,
  primaryStyle: string,
  tags: string[],
  previewKind: PreviewKind,
  analysisStatus: AnalysisStatus,
): LibraryFixture {
  return {
    id,
    title,
    primaryStyle,
    tags,
    previewKind,
    analysisStatus,
    source: 'Image import',
    colours: tags.slice(0, 2),
    createdAt: JULY_25_2026 - LIBRARY_FIXTURES_SAFE_OFFSET(id),
  };
}

function galleryFamily(
  id: string,
  title: string,
  referenceCount: number,
  versions: GalleryFamilyFixture['versions'],
): GalleryFamilyFixture {
  return {
    id,
    title,
    versionIds: versions.map((version) => version.id),
    featuredVersionId: versions[0].id,
    versions: versions.map((version) => ({ ...version, familyId: id })),
    referenceCount,
    createdAt: JULY_25_2026 - 86_400_000,
    updatedAt: JULY_25_2026,
  };
}

function galleryVersion(
  id: string,
  title: string,
  label: string,
  previewKind: PreviewKind,
  outputTarget: OutputTarget,
): GalleryFamilyFixture['versions'][number] {
  return {
    id,
    familyId: '',
    title,
    label,
    previewKind,
    outputTarget,
    sourceDesignId: `${id}-design`,
    sourceRevisionId: `${id}-revision`,
    sourceFileIds: [`${id}-source`],
    bundledAssetIds: [],
    previewAssetId: `${id}-preview`,
    provenanceSnapshotId: `${id}-provenance`,
    createdAt: JULY_25_2026,
  };
}

function LIBRARY_FIXTURES_SAFE_OFFSET(id: string): number {
  return id.length * 3_600_000;
}
