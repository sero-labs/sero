/**
 * Whether a declared control actually controls anything (spec §6.5).
 *
 * The shape checks in `tweaks.ts` say a definition is well-formed. These say it
 * is *true of this page*: the custom property exists in the code the run emitted,
 * and the page reads it somewhere. Both halves matter and they fail differently —
 * a property that was never declared moves nothing, and one declared but never
 * read moves nothing either, while looking perfectly legitimate in the panel.
 *
 * Dropping is deliberately not fatal. A page with two inert controls is still a
 * good page; refusing the revision over them would throw the work away. So the
 * invalid ones are removed, the valid ones render, and what was dropped is
 * reported in one line the user can expand (spec §6.5).
 */

import type { DroppedTweak, TweakDefinition, TweakManifest } from './tweaks';
import { MAX_TWEAK_CONTROLS, TWEAK_SCHEMA_VERSION, normalizeTweakDefinition } from './tweaks';

/** Escaped for use inside a pattern; a custom property name is otherwise literal. */
function escapeForPattern(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Does the code declare this property?
 *
 * The optional quote covers React's inline-style form — `{'--display-scale': …}` —
 * which is a declaration by any useful definition even though it is not CSS text.
 * The trailing lookahead is what stops `--gap` matching `--gap-large`.
 */
export function declaresVariable(source: string, cssVariable: string): boolean {
  const name = escapeForPattern(cssVariable);
  return new RegExp(`${name}(?![A-Za-z0-9_-])\\s*['"]?\\s*:`).test(source);
}

/** Does anything read it back? A declaration nothing reads styles nothing. */
export function usesVariable(source: string, cssVariable: string): boolean {
  const name = escapeForPattern(cssVariable);
  return new RegExp(`var\\(\\s*${name}(?![A-Za-z0-9_-])`).test(source);
}

export interface TweakValidation {
  manifest: TweakManifest;
  dropped: DroppedTweak[];
}

/**
 * Validate what the run declared against what it wrote.
 *
 * `source` is every emitted file concatenated, not only the stylesheets: the
 * React target puts custom properties in a `<style>` block inside a component or
 * on an inline style object, and scanning only `.css` files would drop every
 * control on a page that never had one.
 */
export function validateTweakControls(
  declared: readonly unknown[],
  source: string,
  variantRevisionId: string,
): TweakValidation {
  const controls: TweakDefinition[] = [];
  const dropped: DroppedTweak[] = [];
  const seenIds = new Set<string>();
  const seenVariables = new Set<string>();

  for (const [index, entry] of declared.entries()) {
    const definition = normalizeTweakDefinition(entry);
    if (definition === null) {
      dropped.push({
        label: labelOf(entry, index),
        reason: 'it is not a usable control — a range needs a workable min, max and step, a choice needs at least two distinct options, and every control needs a default value it accepts',
      });
      continue;
    }

    if (seenIds.has(definition.id)) {
      dropped.push({ label: definition.label, reason: `another control already uses the id \`${definition.id}\`` });
      continue;
    }
    if (seenVariables.has(definition.cssVariable)) {
      dropped.push({
        label: definition.label,
        reason: `another control already sets \`${definition.cssVariable}\`, and two controls cannot own one property`,
      });
      continue;
    }
    if (!declaresVariable(source, definition.cssVariable)) {
      dropped.push({
        label: definition.label,
        reason: `the page never declares \`${definition.cssVariable}\``,
      });
      continue;
    }
    if (!usesVariable(source, definition.cssVariable)) {
      dropped.push({
        label: definition.label,
        reason: `the page declares \`${definition.cssVariable}\` but never reads it, so changing it would do nothing`,
      });
      continue;
    }
    if (controls.length >= MAX_TWEAK_CONTROLS) {
      dropped.push({
        label: definition.label,
        reason: `only the first ${MAX_TWEAK_CONTROLS} controls are kept`,
      });
      continue;
    }

    seenIds.add(definition.id);
    seenVariables.add(definition.cssVariable);
    controls.push(definition);
  }

  return {
    manifest: { schemaVersion: TWEAK_SCHEMA_VERSION, variantRevisionId, controls },
    dropped,
  };
}

/** Something to call a definition that was too malformed to have a label. */
function labelOf(entry: unknown, index: number): string {
  if (typeof entry === 'object' && entry !== null) {
    const candidate = entry as Record<string, unknown>;
    for (const key of ['label', 'id', 'cssVariable']) {
      const value = candidate[key];
      if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, 64);
    }
  }
  return `Control ${index + 1}`;
}

/** One compact line, expanded on demand — never a block of warning text. */
export function describeDropped(dropped: DroppedTweak[]): string {
  return `${dropped.length} control${dropped.length === 1 ? '' : 's'} omitted`;
}
