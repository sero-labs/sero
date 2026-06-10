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

export function nodeLine(node: { id: string; type?: string; file_type?: string; description?: string }): string {
  const type = node.type ?? node.file_type;
  const typeSuffix = type ? ` (${type})` : '';
  const description = node.description ? ` — ${node.description}` : '';
  return `${node.id}${typeSuffix}${description}`;
}

export function edgeLine(edge: { source: string; relation: string; target: string }): string {
  return `${edge.source} --${edge.relation}--> ${edge.target}`;
}
