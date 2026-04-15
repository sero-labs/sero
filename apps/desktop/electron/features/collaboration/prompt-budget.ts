const TRUNCATION_NOTICE_PREFIX = '[truncated';

/**
 * Cap unbounded collaborator outputs before embedding them into synthesis prompts.
 */
export function budgetPromptText(text: string, maxChars: number): string {
  if (maxChars <= 0) {
    return '';
  }

  if (text.length <= maxChars) {
    return text;
  }

  const omittedChars = text.length - maxChars;
  const truncated = text.slice(0, maxChars).trimEnd();
  return `${truncated}\n\n${TRUNCATION_NOTICE_PREFIX} ${omittedChars} chars]`;
}
