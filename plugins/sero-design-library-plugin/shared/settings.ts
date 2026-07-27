/**
 * Everything on the Settings surface (spec §10). All of it persists to plugin
 * state. Media provider configuration lands here in PR 3; the shape is kept
 * open so adding it does not migrate the settings record.
 */

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

export interface DesignLibrarySettings {
  librarianModel: ModelSelection;
  designModel: ModelSelection;
  generation: GenerationSettings;
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
  layout: {
    inspectorWidth: 352,
    sessionsRailCollapsed: false,
  },
};

export function modelSelectionIsEmpty(selection: ModelSelection): boolean {
  return selection.providerId === '' || selection.modelId === '';
}
