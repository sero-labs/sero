/** Remove secret-shaped fields as a final defence before a control reply crosses IPC. */
export function protectAgentNodeReply(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(protectAgentNodeReply);
  if (typeof value !== 'object' || value === null) return value;
  const safe: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^(token|accessToken|refreshToken|apiKey)$/i.test(key)) continue;
    safe[key] = protectAgentNodeReply(child);
  }
  return safe;
}
