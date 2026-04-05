export function modelKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

export function parseModelKey(value: string): { provider: string; modelId: string } | null {
  const separatorIndex = value.indexOf('/');
  if (separatorIndex <= 0) return null;
  return {
    provider: value.slice(0, separatorIndex),
    modelId: value.slice(separatorIndex + 1),
  };
}
