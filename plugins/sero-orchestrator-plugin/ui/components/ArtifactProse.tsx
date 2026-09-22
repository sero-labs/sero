/**
 * One artifact's prose, rendered from its document model.
 *
 * Tailwind utilities only, on purpose: the plugin's plain CSS is wrapped in
 * `@scope`, so a `--color-room-*` name written in a stylesheet would resolve
 * nowhere. Utilities carry the tokens; a class written here would not.
 *
 * The typography is the drawing's `.prose` — 12.5px, 1.6 line height, the
 * secondary text colour — so the plan card reads the same as the frame it came
 * from.
 */

import { isBlankLine, partKeys, toArtifactLine, type ArtifactSpan } from '../lib/artifact-document';

function Spans({ spans }: { spans: ArtifactSpan[] }) {
  const keys = partKeys(spans.map((span) => span.text));
  return (
    <>
      {spans.map((span, at) => (
        span.bold
          ? <strong key={keys[at]} className="font-semibold text-foreground">{span.text}</strong>
          : <span key={keys[at]}>{span.text}</span>
      ))}
    </>
  );
}

/** The lines of one section, each drawn as the kind of line its author wrote. */
export function ArtifactProse({ lines }: { lines: string[] }) {
  const drawn = lines.map(toArtifactLine).filter((line) => !isBlankLine(line));
  if (drawn.length === 0) return null;
  // Each line is named by its own text, so inserting a line does not re-key the
  // ones after it.
  const keys = partKeys(drawn.map((line) => line.spans.map((span) => span.text).join('')));

  return (
    <div className="flex flex-col gap-1.5 text-[12.5px] leading-[1.6] text-muted-foreground">
      {drawn.map((line, at) => {
        const key = keys[at];
        if (line.kind === 'bullet') {
          return (
            <div key={key} className="flex gap-2">
              <span aria-hidden className="shrink-0 text-muted-foreground/60">•</span>
              <span className="min-w-0"><Spans spans={line.spans} /></span>
            </div>
          );
        }
        if (line.kind === 'number') {
          return (
            <div key={key} className="flex gap-2">
              <span aria-hidden className="shrink-0 tabular-nums text-muted-foreground/60">{line.ordinal}.</span>
              <span className="min-w-0"><Spans spans={line.spans} /></span>
            </div>
          );
        }
        return (
          <p key={key} className="m-0">
            <Spans spans={line.spans} />
          </p>
        );
      })}
    </div>
  );
}
