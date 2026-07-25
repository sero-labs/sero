export type EntityId = string;
export type EpochMilliseconds = number;

export type OutputTarget = 'html' | 'react-tailwind';
export type RevisionBehaviour = 'replace' | 'retain';
export type AnalysisStatus = 'queued' | 'analysing' | 'ready' | 'failed';
export type JobKind = 'librarian' | 'variant' | 'generated-asset';
export type JobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export interface AestheticTerm {
  term: string;
  meaning?: string;
}

export interface PaletteColour {
  hex: string;
  role: string;
}

export interface LibrarianVisualProfile {
  colour: string[];
  typography: string[];
  layout: string[];
  spacingAndDensity: string[];
  shapeLanguage: string[];
  surfaces: string[];
  imagery: string[];
  motion: string[];
}

export interface LibrarianUserFacingAnalysis {
  title: string;
  notes: string;
  designTypes: string[];
  primaryStyle: string;
  tags: string[];
  summary: string;
  designIntent: string;
  aestheticVocabulary: AestheticTerm[];
  visualProfile: LibrarianVisualProfile;
  palette?: PaletteColour[];
  always: string[];
  never: string[];
  generationPrompt: string;
}

export interface LibrarianProvenance {
  providerId?: string;
  modelId?: string;
  analysedAt: EpochMilliseconds;
  durationMs?: number;
  tokenUsage?: unknown;
  cost?: number;
  promptVersion: number;
}

export interface LibrarianAnalysis extends LibrarianUserFacingAnalysis {
  schemaVersion: number;
  confidence: number;
  provenance: LibrarianProvenance;
}

export type LibrarianField = keyof LibrarianUserFacingAnalysis;

export interface FieldOverride<TField extends LibrarianField> {
  field: TField;
  value: LibrarianUserFacingAnalysis[TField];
  updatedAt: EpochMilliseconds;
}

export type LibrarianOverrides = {
  [TField in LibrarianField]?: FieldOverride<TField>;
};

export interface EditableLibrarianProfile {
  generated: LibrarianAnalysis;
  overrides: LibrarianOverrides;
}

export interface LibraryItemSummary {
  id: EntityId;
  title: string;
  primaryStyle: string;
  tags: string[];
  source: string;
  colours: string[];
  analysisStatus: AnalysisStatus;
  createdAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
}

export interface LiveLibraryReference {
  kind: 'live';
  itemId: EntityId;
}

export interface TombstonedLibraryReference {
  kind: 'tombstone';
  sourceItemId: EntityId;
  title: string;
  primaryStyle: string;
  tags: string[];
  deletedAt: EpochMilliseconds;
}

export type LibraryReferenceSource = LiveLibraryReference | TombstonedLibraryReference;

export interface OrderedDesignReference {
  position: number;
  role: 'primary' | 'secondary';
  source: LibraryReferenceSource;
}

export interface DurableJob {
  id: EntityId;
  kind: JobKind;
  ownerId: EntityId;
  status: JobStatus;
  attempt: number;
  createdAt: EpochMilliseconds;
  startedAt?: EpochMilliseconds;
  completedAt?: EpochMilliseconds;
  errorMessage?: string;
}

export interface GeneratedAssetProvenance {
  toolId: string;
  providerId: string;
  modelId: string;
  prompt: string;
  parameters: Record<string, unknown>;
  seed?: string;
  reportedCost?: number;
  startedAt: EpochMilliseconds;
  completedAt?: EpochMilliseconds;
  providerExtension?: Record<string, unknown>;
}

export interface GeneratedAssetRevision {
  id: EntityId;
  assetId: EntityId;
  revisionNumber: number;
  status: 'ready' | 'placeholder' | 'deleted';
  localAssetId: EntityId;
  provenance: GeneratedAssetProvenance;
  createdAt: EpochMilliseconds;
}

export interface GeneratedAsset {
  id: EntityId;
  designId: EntityId;
  title: string;
  visibleRevisionId: EntityId;
  revisionIds: EntityId[];
  createdAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
}

export interface DesignRevision {
  id: EntityId;
  variantId: EntityId;
  revisionNumber: number;
  outputTarget: OutputTarget;
  sourceFileIds: EntityId[];
  generatedAssetRevisionIds: EntityId[];
  createdAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
}

export interface DesignVariant {
  id: EntityId;
  designId: EntityId;
  title: string;
  visibleRevisionId?: EntityId;
  revisionIds: EntityId[];
  jobId?: EntityId;
}

export interface Design {
  id: EntityId;
  title: string;
  request: string;
  outputTarget: OutputTarget;
  references: OrderedDesignReference[];
  variantIds: EntityId[];
  createdAt: EpochMilliseconds;
  updatedAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
}

export interface GalleryVersion {
  id: EntityId;
  familyId: EntityId;
  sourceDesignId: EntityId;
  sourceRevisionId: EntityId;
  title: string;
  outputTarget: OutputTarget;
  sourceFileIds: EntityId[];
  bundledAssetIds: EntityId[];
  previewAssetId: EntityId;
  provenanceSnapshotId: EntityId;
  createdAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
}

export interface GalleryFamily {
  id: EntityId;
  title: string;
  versionIds: EntityId[];
  featuredVersionId: EntityId;
  linkedSourceFamilyId?: EntityId;
  createdAt: EpochMilliseconds;
  updatedAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
}

export interface DesignLibraryProfileSettings {
  variantCount: 1 | 2 | 3 | 4 | 5;
  revisionBehaviour: RevisionBehaviour;
}
