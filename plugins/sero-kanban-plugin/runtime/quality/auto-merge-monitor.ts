export function buildAutoMergePendingMessage(prNumber: number): string {
  return `Auto-merge pending for PR #${prNumber}. GitHub will merge it once required conditions are met.`;
}
