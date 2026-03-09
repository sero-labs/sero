/**
 * Built-in modifiers for the Humanizer.
 *
 * Modifiers layer additional constraints on top of the selected style(s).
 * They're always available and cannot be deleted. Users can create custom modifiers.
 */

import type { Modifier } from '../../shared/types';

export const BUILT_IN_MODIFIERS: Modifier[] = [
  {
    id: 'casual',
    label: 'Casual',
    prompt: 'Use a relaxed, conversational tone. Write like you\'re explaining to a friend.',
    builtIn: true,
  },
  {
    id: 'formal',
    label: 'Formal',
    prompt: 'Maintain a formal register. Use precise language. Avoid contractions and slang.',
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
    prompt: 'Make the fewest changes possible. Preserve the original structure and most wording.',
    builtIn: true,
  },
  {
    id: 'expand',
    label: 'Expand',
    prompt: 'Flesh out the ideas fully. Add detail, examples, and texture. Don\'t be brief.',
    builtIn: true,
  },
];
