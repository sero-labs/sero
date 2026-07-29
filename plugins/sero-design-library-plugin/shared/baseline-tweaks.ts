import type { TweakControl, TweakDefinition } from './tweaks';

export interface BaselineTweak {
  id: string;
  label: string;
  cssVariable: `--${string}`;
  type: TweakControl['type'];
}

/** Standard typography controls every generated page must support, in UI order. */
export const BASELINE_TWEAKS: readonly BaselineTweak[] = [
  { id: 'font', label: 'Font', cssVariable: '--font-family', type: 'choice' },
  { id: 'h1-size', label: 'H1 size', cssVariable: '--h1-size', type: 'range' },
  { id: 'h1-weight', label: 'H1 weight', cssVariable: '--h1-weight', type: 'choice' },
  { id: 'h1-tracking', label: 'H1 tracking', cssVariable: '--h1-tracking', type: 'range' },
  { id: 'h2-size', label: 'H2 size', cssVariable: '--h2-size', type: 'range' },
  { id: 'body-font', label: 'Body font', cssVariable: '--body-font', type: 'choice' },
  { id: 'body-size', label: 'Body size', cssVariable: '--body-size', type: 'range' },
] as const;

/** Why a finished manifest does not meet the baseline contract. */
export function baselineTweakProblem(controls: readonly TweakDefinition[]): string | null {
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
