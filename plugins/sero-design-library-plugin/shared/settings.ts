/**
 * Everything on the Settings surface (spec §10). All of it persists to plugin
 * state.
 *
 * The provider key is the one exception and deliberately not here: it lives in a
 * `0600` file, because state is read by the UI (spec §8.3).
 */

import type { MediaCapability } from './media';

export interface PromptRecipe {
  id: string;
  name: string;
  /** Instruction template applied on top of the request. */
  instruction: string;
  builtIn: boolean;
}

export type RevisionBehaviour = 'replace' | 'retain';

export interface ModelSelection {
  /** Provider id, or empty for "use Sero's configured model". */
  providerId: string;
  /** Model id within the provider, or empty for the same. */
  modelId: string;
}

export interface GenerationSettings {
  /** Default number of variants a new Design starts with, 1–5. */
  variantCount: number;
  revisionBehaviour: RevisionBehaviour;
  recipes: PromptRecipe[];
}

/** Persisted layout preferences — not user-editable in a settings form. */
export interface LayoutSettings {
  inspectorWidth: number;
  sessionsRailCollapsed: boolean;
}

/**
 * Media generation (spec §8, D7 and D10).
 *
 * One editable model id per capability, because the provider exposes hundreds of
 * endpoints and a live browser would need a catalogue API and network at
 * settings time for marginal benefit. The agent chooses a *capability*; it never
 * chooses an endpoint.
 */
export interface MediaSettings {
  /** Opaque provider model ids. An empty string means the adapter's default. */
  models: Record<MediaCapability, string>;
  /**
   * How many media calls one generation run may make (D10). Small by default:
   * an agent able to call video generation autonomously inside a multi-variant
   * run makes "rely on the account limit" a way to find out after paying.
   */
  callsPerRun: number;
}

export const MAX_CALLS_PER_RUN = 20;

export interface DesignLibrarySettings {
  librarianModel: ModelSelection;
  designModel: ModelSelection;
  generation: GenerationSettings;
  media: MediaSettings;
  layout: LayoutSettings;
}

export const EMPTY_MODEL_SELECTION: ModelSelection = { providerId: '', modelId: '' };

export const BUILT_IN_RECIPES: PromptRecipe[] = [
  {
    id: 'faithful',
    name: 'Faithful to references',
    instruction:
      'Stay close to the reference design language. Prefer the referenced rhythm, density and type treatment over novelty.',
    builtIn: true,
  },
  {
    id: 'exploratory',
    name: 'Exploratory',
    instruction:
      'Treat the reference language as a starting point. Push composition and hierarchy somewhere the references only hint at.',
    builtIn: true,
  },
  {
    id: 'production',
    name: 'Production ready',
    instruction:
      'Favour restraint, accessible contrast and realistic content lengths. Avoid decorative flourishes that would not survive review.',
    builtIn: true,
  },
];

export const DEFAULT_SETTINGS: DesignLibrarySettings = {
  librarianModel: { ...EMPTY_MODEL_SELECTION },
  designModel: { ...EMPTY_MODEL_SELECTION },
  generation: {
    variantCount: 3,
    revisionBehaviour: 'replace',
    recipes: BUILT_IN_RECIPES,
  },
  media: {
    // Empty means "whatever the adapter defaults to", so a change of default
    // endpoint reaches every profile that never edited it.
    models: {
      'text-to-image': '',
      'image-to-image': '',
      upscale: '',
      'text-to-video': '',
    },
    callsPerRun: 4,
  },
  layout: {
    inspectorWidth: 352,
    sessionsRailCollapsed: false,
  },
};

export function modelSelectionIsEmpty(selection: ModelSelection): boolean {
  return selection.providerId === '' || selection.modelId === '';
}
