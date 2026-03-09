/**
 * Builds the LLM prompt for text transformation.
 *
 * Handles three scenarios:
 * 1. Humanizer style only → references the humanizer SKILL.md
 * 2. Creative style(s) → uses inline style prompts
 * 3. Humanizer + creative style(s) → skill reference + blended prompts
 *
 * Modifiers are always appended as additional constraints.
 */

import type { Style, Modifier } from '../shared/types';

interface PromptOptions {
  text: string;
  styles: Style[];
  modifiers: Modifier[];
}

export function buildPrompt({ text, styles, modifiers }: PromptOptions): string {
  const parts: string[] = [];

  // Determine if the humanizer skill is needed
  const usesSkill = styles.some((s) => s.usesSkill);
  const creativeStyles = styles.filter((s) => !s.usesSkill);

  // ── Skill reference ────────────────────────────────────
  if (usesSkill) {
    parts.push(
      'First, read the humanizer skill file using the read tool to load its full instructions.',
    );
  }

  // ── Style instructions ─────────────────────────────────
  if (styles.length === 1 && usesSkill && creativeStyles.length === 0) {
    // Pure humanizer mode
    parts.push(
      'Apply those instructions to rewrite the following text. ' +
        'Return ONLY the final text with no preamble or commentary.',
    );
  } else if (styles.length === 1 && creativeStyles.length === 1) {
    // Single creative style
    const style = creativeStyles[0];
    parts.push(
      `You are a master of this writing style: ${style.label}.\n\n` +
        `${style.prompt}\n\n` +
        'Transform or create text in this voice. ' +
        'Return ONLY the final text with no preamble or commentary.',
    );
  } else if (styles.length > 1) {
    // Blended styles
    const styleDescriptions = styles
      .map((s) => (s.usesSkill ? `- ${s.label}: Apply humanizer skill instructions` : `- ${s.label}: ${s.prompt}`))
      .join('\n');

    if (usesSkill) {
      parts.push('Apply the humanizer skill instructions, AND ALSO blend in these writing styles:');
    } else {
      parts.push('Blend these writing styles into a cohesive voice:');
    }
    parts.push(`\n${styleDescriptions}\n`);
    parts.push(
      'Merge these influences naturally — don\'t alternate between them, synthesize them. ' +
        'Return ONLY the final text with no preamble or commentary.',
    );
  } else {
    // No styles selected — basic transform
    parts.push(
      'Rewrite or expand the following text, improving clarity and voice. ' +
        'Return ONLY the final text with no preamble or commentary.',
    );
  }

  // ── Modifiers ──────────────────────────────────────────
  if (modifiers.length > 0) {
    const modifierText = modifiers.map((m) => m.prompt).join(' ');
    parts.push(`\nAdditional constraints: ${modifierText}`);
  }

  // ── Input text ─────────────────────────────────────────
  parts.push(`\nText to transform:\n\n${text}`);

  return parts.join('\n');
}

/**
 * Dynamic label for the action button based on selected styles.
 */
export function getActionLabel(styles: Style[]): string {
  if (styles.length === 0) return 'Transform';
  if (styles.length === 1 && styles[0].id === 'humanizer') return 'Humanize';
  return 'Transform';
}

/**
 * Dynamic placeholder for the input textarea.
 */
export function getPlaceholder(styles: Style[]): string {
  if (styles.length === 0) {
    return 'Paste text to transform, or describe an idea to bring to life…';
  }
  if (styles.length === 1 && styles[0].id === 'humanizer') {
    return 'Paste your AI-generated text here…';
  }
  const names = styles.map((s) => s.label).join(' + ');
  return `Write an idea or paste text to transform with ${names}…`;
}
