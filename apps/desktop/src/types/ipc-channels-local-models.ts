/** Local model management IPC channels. */
export const localModelsIpcChannels = {
  /** Read the current models.json config. Returns LocalModelsConfig. */
  getConfig: 'sero:local-models:get-config',
  /** Write the full models.json config. */
  saveConfig: 'sero:local-models:save-config',
  /** Test connectivity to a local provider's base URL. */
  testConnection: 'sero:local-models:test-connection',
  /** Fetch available models from a provider's API (e.g. Ollama /api/tags). */
  fetchRemoteModels: 'sero:local-models:fetch-remote-models',
} as const;
