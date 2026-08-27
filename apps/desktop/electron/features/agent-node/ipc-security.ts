/** Remove secret-shaped fields as a final defence before a control reply crosses IPC. */
export function protectAgentNodeReply(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(protectAgentNodeReply);
  if (typeof value !== 'object' || value === null) return value;
  const safe: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^(token|accessToken|refreshToken)$/i.test(key)) continue;
    if (/^apiKey$/i.test(key) && !isApiKeyProviderCatalogue(child)) continue;
    safe[key] = protectAgentNodeReply(child);
  }
  return safe;
}

function isApiKeyProviderCatalogue(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const record = item as Record<string, unknown>;
    return Object.keys(record).every((key) => ['id', 'name', 'hasKey', 'fromEnv'].includes(key))
      && typeof record.id === 'string' && typeof record.name === 'string'
      && typeof record.hasKey === 'boolean' && typeof record.fromEnv === 'boolean';
  });
}
