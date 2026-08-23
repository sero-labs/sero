import type { StepGuard } from '../../shared/types';

const routeText = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value);

/** Human-readable guard, such as "only if route = simple / standard". */
export function guardLabel(when: StepGuard): string {
  if (when.default) return `${when.var}: default branch`;
  return `only if ${when.var} = ${(when.in ?? []).map(routeText).join(' / ')}`;
}
