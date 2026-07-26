/**
 * The three right-hand columns of the history band.
 *
 * The header labels and the commit rows are separate components, so the widths
 * live here and both read them — that is what keeps each label sitting over the
 * values it names. Both sides also use `gap-2` and a `pr-4` right edge; change
 * one of those and the header drifts off its column.
 */
export const COLUMN = {
  hash: 'w-16',
  author: 'w-14',
  when: 'w-16',
} as const;
