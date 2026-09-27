import { stripManagedFileMetadata } from './memory-format';

export interface ManagedFieldLine {
  lineIndex: number;
  label: string;
  normalizedLabel: string;
  value: string;
}

const FIELD_LINE_REGEX = /^\s*(?:[-*]\s*)?(?:\*\*)?([A-Za-z][A-Za-z0-9 /_-]{0,60}?)(?::\s*(?:\*\*)?|\*\*\s*:\s*)(.+?)\s*$/;

export function normalizeFieldLabel(label: string): string {
  return label.replace(/\*+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function parseManagedFieldLines(content: string): ManagedFieldLine[] {
  return stripManagedFileMetadata(content)
    .split('\n')
    .map((line, lineIndex) => ({ line, lineIndex, match: line.match(FIELD_LINE_REGEX) }))
    .filter((item): item is { lineIndex: number; match: RegExpMatchArray; line: string } => Boolean(item.match))
    .map(({ lineIndex, match }) => {
      const label = match[1]!.trim();
      return {
        lineIndex,
        label,
        normalizedLabel: normalizeFieldLabel(label),
        value: match[2]!.trim(),
      };
    })
    .filter((field) => Boolean(field.value));
}
