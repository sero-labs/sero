import { stripManagedFileMetadata } from './memory-format';

export interface ManagedFieldLine {
  lineIndex: number;
  label: string;
  normalizedLabel: string;
  value: string;
}

export interface ManagedFieldMergeResult {
  content: string;
  updatedLabels: string[];
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

export function formatManagedFieldLine(label: string, value: string): string {
  return `- **${label.trim()}:** ${value.trim()}`;
}

export function mergeManagedFieldUpdate(
  existingContent: string | null,
  incomingContent: string,
): ManagedFieldMergeResult | null {
  const existingBody = stripManagedFileMetadata(existingContent ?? '').trimEnd();
  const incomingBody = stripManagedFileMetadata(incomingContent).trimEnd();
  if (!existingBody.trim()) return null;

  const existingFields = parseManagedFieldLines(existingBody);
  const incomingFields = parseManagedFieldLines(incomingBody);
  if (existingFields.length === 0 || incomingFields.length === 0) return null;

  const existingLabels = new Set(existingFields.map((field) => field.normalizedLabel));
  const incomingByLabel = new Map<string, ManagedFieldLine>();
  for (const field of incomingFields) incomingByLabel.set(field.normalizedLabel, field);

  const matchingLabels = [...incomingByLabel.keys()].filter((label) => existingLabels.has(label));
  if (matchingLabels.length === 0) return null;

  const fieldByLine = new Map(existingFields.map((field) => [field.lineIndex, field]));
  const incomingFieldByLine = new Map(incomingFields.map((field) => [field.lineIndex, field]));
  const replacedLabels = new Set<string>();
  const updatedLabels: string[] = [];
  const nextLines: string[] = [];

  for (const [lineIndex, line] of existingBody.split('\n').entries()) {
    const existingField = fieldByLine.get(lineIndex);
    const incomingField = existingField ? incomingByLabel.get(existingField.normalizedLabel) : undefined;
    if (!existingField || !incomingField) {
      nextLines.push(line);
      continue;
    }

    if (replacedLabels.has(existingField.normalizedLabel)) continue;

    nextLines.push(formatManagedFieldLine(existingField.label, incomingField.value));
    replacedLabels.add(existingField.normalizedLabel);
    updatedLabels.push(existingField.label);
  }

  const unmatchedIncomingLines = incomingBody
    .split('\n')
    .filter((line, lineIndex) => {
      const incomingField = incomingFieldByLine.get(lineIndex);
      return !incomingField || !existingLabels.has(incomingField.normalizedLabel);
    })
    .join('\n')
    .trim();

  if (unmatchedIncomingLines) {
    if (nextLines.some((line) => line.trim())) nextLines.push('');
    nextLines.push(unmatchedIncomingLines);
  }

  return {
    content: nextLines.join('\n').trimEnd(),
    updatedLabels,
  };
}
