/**
 * Builds the LLM prompt for humanizing text.
 *
 * Explicitly instructs the agent to read the humanizer skill file
 * before applying it — Pi skills use progressive disclosure, so
 * the agent must load the full SKILL.md via the Read tool.
 */

export function buildHumanizePrompt(text: string, instructions?: string): string {
  const parts: string[] = [
    'First, read the humanizer skill file using the read tool to load its full instructions. Then apply those instructions to rewrite the following text. Return ONLY the final humanized text with no preamble or commentary.',
  ];

  if (instructions) {
    parts.push(`\nAdditional instructions: ${instructions}`);
  }

  parts.push(`\nText to humanize:\n\n${text}`);

  return parts.join('');
}
