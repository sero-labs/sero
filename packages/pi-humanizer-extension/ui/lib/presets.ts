/**
 * Built-in instruction presets for the humanizer.
 *
 * These are always available and cannot be deleted.
 * Users can create additional custom presets that persist in state.
 */

import type { InstructionPreset } from '../../shared/types';

export const BUILT_IN_PRESETS: InstructionPreset[] = [
  {
    id: 'casual',
    label: 'Casual',
    prompt: 'Use a relaxed, conversational tone. Write like you\'re explaining to a friend.',
    builtIn: true,
  },
  {
    id: 'academic',
    label: 'Academic',
    prompt: 'Maintain a formal academic register. Use precise language and cite-ready phrasing. Avoid first person.',
    builtIn: true,
  },
  {
    id: 'technical',
    label: 'Technical',
    prompt: 'Preserve all technical terms, code references, and domain-specific jargon exactly. Only humanize the surrounding prose.',
    builtIn: true,
  },
  {
    id: 'concise',
    label: 'Concise',
    prompt: 'Be ruthlessly concise. Cut every unnecessary word. Prefer short sentences.',
    builtIn: true,
  },
  {
    id: 'british',
    label: 'British English',
    prompt: 'Use British English spelling and conventions (colour, organisation, whilst, etc.).',
    builtIn: true,
  },
  {
    id: 'opinionated',
    label: 'Opinionated',
    prompt: 'Write with a clear point of view. Have opinions. Don\'t hedge everything. Let personality come through.',
    builtIn: true,
  },
  {
    id: 'minimal',
    label: 'Minimal edits',
    prompt: 'Make the fewest changes possible. Only fix the most obvious AI tells — leave everything else untouched.',
    builtIn: true,
  },
];
