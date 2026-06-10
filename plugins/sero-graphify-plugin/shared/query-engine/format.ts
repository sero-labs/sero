const CHARS_PER_TOKEN = 4;

/** Truncate rendered lines to a token budget (approx 4 chars/token). */
export function withinBudget(lines: string[], budgetTokens: number): string {
  const maxChars = Math.max(budgetTokens, 100) * CHARS_PER_TOKEN;
  const output: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > maxChars) {
      output.push('… (truncated to budget)');
      break;
    }
    output.push(line);
    used += line.length + 1;
  }
  return output.join('\n');
}

export interface DisplayNode {
  id: string;
  label?: string;
  type?: string;
  file_type?: string;
  description?: string;
  repo?: string;
  source_file?: string;
}

/** Human display name: label when present (e.g. "App()"), else the raw id. */
export function displayName(node: DisplayNode | undefined, fallbackId: string): string {
  return node?.label || node?.id || fallbackId;
}

export function nodeLine(node: DisplayNode): string {
  const type = node.type ?? node.file_type;
  const where = [node.repo, node.source_file].filter(Boolean).join('/');
  const parts = [`${displayName(node, node.id)}${type ? ` (${type})` : ''}`];
  if (where) parts.push(where);
  if (node.description) parts.push(node.description);
  return parts.join(' — ');
}

export function edgeLine(
  edge: { source: string; relation: string; target: string },
  resolve: (id: string) => string = (id) => id,
): string {
  return `${resolve(edge.source)} --${edge.relation}--> ${resolve(edge.target)}`;
}
