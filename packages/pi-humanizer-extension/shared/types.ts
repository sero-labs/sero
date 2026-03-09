/**
 * Shared state shape for the Humanizer app.
 *
 * Both the Pi extension and the Sero web UI import this.
 * State is global-scoped (~/.sero-ui/apps/humanizer/state.json).
 */

export interface HumanizeEntry {
  id: number;
  inputText: string;
  instructions: string;
  outputText: string;
  createdAt: string; // ISO string
}

/** A user-created instruction preset. */
export interface InstructionPreset {
  id: string;
  label: string;
  prompt: string;
  builtIn?: boolean;
}

export interface HumanizerState {
  entries: HumanizeEntry[];
  nextId: number;
  /** Optional for backwards-compat with existing state.json files. */
  customPresets?: InstructionPreset[];
}

export const DEFAULT_STATE: HumanizerState = {
  entries: [],
  nextId: 1,
  customPresets: [],
};
