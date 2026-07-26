/**
 * Middle truncation — `chore/review-open-iss…25cb4`.
 *
 * Branches that share a long prefix are indistinguishable when truncated from
 * the right, which is the whole problem in a 214px rail (§3). `@pierre/trees`
 * ships exactly this and does not export it, so it is ours.
 *
 * CSS has no middle-ellipsis, so the head is clipped without its own ellipsis
 * and a fixed tail is pinned beside it — one ellipsis, and it reflows with the
 * available width rather than guessing at character counts.
 */

interface Props {
  value: string;
  /** Characters kept at the end, where the distinguishing part usually is. */
  tailLength?: number;
  className?: string;
}

export function MiddleTruncate({ value, tailLength = 6, className = '' }: Props) {
  if (value.length <= tailLength + 1) {
    return <span className={`truncate ${className}`} title={value}>{value}</span>;
  }

  const head = value.slice(0, value.length - tailLength);
  const tail = value.slice(value.length - tailLength);

  return (
    <span className={`flex min-w-0 ${className}`} title={value}>
      <span className="overflow-hidden whitespace-nowrap">{head}</span>
      <span className="shrink-0 whitespace-nowrap">{tail}</span>
    </span>
  );
}
