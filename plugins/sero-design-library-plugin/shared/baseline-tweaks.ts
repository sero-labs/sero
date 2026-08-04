import type { TweakControl, TweakDefinition } from './tweaks';
import { DESIGN_FONT_OPTIONS } from './fonts';

export interface BaselineTweak {
  id: string;
  label: string;
  cssVariable: `--${string}`;
  type: TweakControl['type'];
}

export const BASELINE_FONT_OPTIONS = DESIGN_FONT_OPTIONS;

/** Standard typography controls every generated page must support, in UI order. */
export const BASELINE_TWEAKS = [
  { id: 'font', label: 'Font', cssVariable: '--font-family', type: 'choice' },
  { id: 'h1-size', label: 'H1 size', cssVariable: '--h1-size', type: 'range' },
  { id: 'h1-weight', label: 'H1 weight', cssVariable: '--h1-weight', type: 'choice' },
  { id: 'h1-tracking', label: 'H1 tracking', cssVariable: '--h1-tracking', type: 'range' },
  { id: 'h2-size', label: 'H2 size', cssVariable: '--h2-size', type: 'range' },
  { id: 'body-font', label: 'Body font', cssVariable: '--body-font', type: 'choice' },
  { id: 'body-size', label: 'Body size', cssVariable: '--body-size', type: 'range' },
] as const satisfies readonly BaselineTweak[];

/** Whether a declaration already starts with the complete baseline. */
export function hasBaselineTweakPrefix(controls: readonly Record<string, unknown>[]): boolean {
  return BASELINE_TWEAKS.every((required, index) => controls[index]?.id === required.id);
}

const BASELINE_RULES = {
  font: { selector: 'h1', property: 'font-family' },
  'h1-size': { selector: 'h1', property: 'font-size' },
  'h1-weight': { selector: 'h1', property: 'font-weight' },
  'h1-tracking': { selector: 'h1', property: 'letter-spacing' },
  'h2-size': { selector: 'h2', property: 'font-size' },
  'body-font': { selector: 'body', property: 'font-family' },
  'body-size': { selector: 'body', property: 'font-size' },
} as const;

function selectorTargetsElement(candidate: string, element: string): boolean {
  const escapedElement = element.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:^|.*[\\s>+~])${escapedElement}(?:[#.][\\w-]+|\\[[^\\]]+\\])*$`,
    'i',
  ).test(candidate);
}

function ruleUsesVariableOnElement(
  source: string,
  selector: string,
  property: string,
  variable: string,
): boolean {
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const afterMarkup = match[1]?.replace(/^.*<\/?[a-z][^>]*>/is, '') ?? '';
    const attributeAt = afterMarkup.indexOf('[');
    const wrapperText = afterMarkup.slice(0, attributeAt < 0 ? undefined : attributeAt);
    const wrapperAt = Math.max(
      wrapperText.lastIndexOf('`'),
      wrapperText.lastIndexOf("'"),
      wrapperText.lastIndexOf('"'),
    );
    const selectorText = afterMarkup.slice(wrapperAt + 1);
    const selectors = selectorText.split(',').map((entry) => entry.trim());
    if (!selectors.some((entry) => selectorTargetsElement(entry, selector))) continue;
    const declarations = match[2] ?? '';
    const escapedVariable = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*var\\(\\s*${escapedVariable}(?:\\s*[,)]|\\s*$)`).test(declarations)) {
      return true;
    }
  }
  return false;
}

const FIXED_TEXT_UNIT = /-?(?:\d*\.)?\d+(?:px|rem|em|pt)\b/i;
const STANDARD_TEXT_UTILITY = /(?:^|:)text-(?:xs|sm|base|lg|xl|[2-9]xl)$/;

function usesFixedTextSize(source: string): boolean {
  for (const match of source.matchAll(/\b(?:font-size|font)\s*:\s*([^;{}]+)/gi)) {
    if (FIXED_TEXT_UNIT.test(match[1] ?? '')) return true;
  }

  // React designs are encouraged to use Tailwind. Its named text utilities turn
  // into fixed rem values only after this source-level check, so they must be
  // caught from class attributes before the browser compiler sees them.
  for (const match of source.matchAll(
    /\bclass(?:Name)?\s*=\s*(?:\{\s*)?(["'`])([\s\S]*?)\1\s*\}?/g,
  )) {
    const tokens = (match[2] ?? '').split(/\s+/);
    if (tokens.some((token) => STANDARD_TEXT_UTILITY.test(token))) return true;
    if (
      tokens.some(
        (token) =>
          /(?:^|:)text-\[[^\]]+\]$/.test(token) &&
          FIXED_TEXT_UNIT.test(token) &&
          !/var\(--(?:body-size|text-[A-Za-z0-9_-]+|h[12]-size)\)/.test(token),
      )
    ) {
      return true;
    }
  }
  return false;
}

/** Why a finished manifest does not meet the baseline contract. */
export function baselineTweakProblem(
  controls: readonly TweakDefinition[],
  source: string,
): string | null {
  for (const [index, required] of BASELINE_TWEAKS.entries()) {
    const control = controls[index];
    if (control === undefined || control.cssVariable !== required.cssVariable) {
      return `The first controls must be the Typography baseline in this order: ${BASELINE_TWEAKS.map((entry) => entry.label).join(', ')}. Missing or misplaced: ${required.label} (${required.cssVariable}).`;
    }
    if (
      control.id !== required.id ||
      control.label !== required.label ||
      control.group !== 'Typography' ||
      control.control.type !== required.type
    ) {
      return `${required.label} must use id \`${required.id}\`, group \`Typography\`, property \`${required.cssVariable}\`, and control type \`${required.type}\`.`;
    }
    if (
      (required.id === 'font' || required.id === 'body-font') &&
      control.control.type === 'choice'
    ) {
      const allowed = BASELINE_FONT_OPTIONS.map((option) => option.value);
      const values = new Set(control.control.options.map((option) => option.value));
      if (
        values.size !== allowed.length ||
        !allowed.every((value) => values.has(value)) ||
        !allowed.includes(String(control.defaultValue) as (typeof allowed)[number])
      ) {
        return `${required.label} must use the standard Design font list, with one of those fonts as its default.`;
      }
    }
    const rule = BASELINE_RULES[required.id as keyof typeof BASELINE_RULES];
    if (!ruleUsesVariableOnElement(source, rule.selector, rule.property, required.cssVariable)) {
      return `${required.label} must be connected with \`${rule.selector} { ${rule.property}: var(${required.cssVariable}); }\` so it changes the intended text.`;
    }
    if ((rule.selector === 'h1' || rule.selector === 'h2') && !new RegExp(`<${rule.selector}(?:\\s|>)`, 'i').test(source)) {
      return `${required.label} cannot work because the page has no \`<${rule.selector}>\` element.`;
    }
  }
  if (usesFixedTextSize(source)) {
    return 'Body size must drive the page typography. Use `var(--body-size)` and a small derived type scale such as `--text-xs`, `--text-sm`, `--text-base` and `--text-lg`; do not hard-code text sizes.';
  }
  return null;
}

/** Exact instructions shared by the task prompt and the declaration tool. */
export function baselineTweakInstructions(): string {
  return BASELINE_TWEAKS.map(
    (control, index) =>
      `${index + 1}. \`${control.id}\` — “${control.label}” — \`${control.cssVariable}\` — ${control.type}`,
  ).join('\n');
}
