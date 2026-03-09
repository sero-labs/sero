/**
 * Shared state shape for the Humanizer app.
 *
 * Both the Pi extension and the Sero web UI import this.
 * State is global-scoped (~/.sero-ui/apps/humanizer/state.json).
 */

// ── Styles ─────────────────────────────────────────────────

export type StyleCategory = 'core' | 'creative' | 'technical' | 'fun';

/** A writing style / creative persona for text transformation. */
export interface Style {
  id: string;
  label: string;
  description: string;
  emoji: string;
  category: StyleCategory;
  /** System-level instructions for the LLM — defines the voice. */
  prompt: string;
  /** If set, the prompt builder will instruct the agent to read this skill file first. */
  usesSkill?: boolean;
  builtIn: boolean;
  /** Tailwind color key for the accent (e.g. 'emerald', 'violet'). */
  color: string;
}

// ── Modifiers (formerly "instruction presets") ─────────────

/** A modifier that layers additional constraints on top of styles. */
export interface Modifier {
  id: string;
  label: string;
  prompt: string;
  builtIn?: boolean;
}

// ── Entries ────────────────────────────────────────────────

export interface HumanizeEntry {
  id: number;
  inputText: string;
  /** Combined modifier instructions (legacy field name for backwards compat). */
  instructions: string;
  outputText: string;
  createdAt: string; // ISO string
  /** Style IDs used (absent in pre-styles entries). */
  styleIds?: string[];
}

// ── Legacy alias for backwards compat ──────────────────────

/** @deprecated Use `Modifier` instead */
export type InstructionPreset = Modifier;

// ── App state ──────────────────────────────────────────────

export interface HumanizerState {
  entries: HumanizeEntry[];
  nextId: number;
  /** Custom modifiers created by the user. */
  customPresets?: Modifier[];
  /** Custom styles created by the user. */
  customStyles?: Style[];
}

export const DEFAULT_STATE: HumanizerState = {
  entries: [],
  nextId: 1,
  customPresets: [],
  customStyles: [],
};
