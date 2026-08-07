export const pluginIpcChannels = {
  /** Install a plugin from a source (npm:, git:, or local path). */
  install: 'sero:plugins:install',
  /** Uninstall a plugin by ID. */
  uninstall: 'sero:plugins:uninstall',
  /** List all installed plugins. */
  list: 'sero:plugins:list',
  listDevSessions: 'sero:plugins:list-dev-sessions',
  startDevSession: 'sero:plugins:start-dev-session',
  refreshDevSession: 'sero:plugins:refresh-dev-session',
  stopDevSession: 'sero:plugins:stop-dev-session',
  /** Check if a specific app is an installed plugin. */
  isPlugin: 'sero:plugins:is-plugin',
  /** Search for public plugins on GitHub (topic) and npm (keyword). */
  search: 'sero:plugins:search',
  /** Main → renderer push: plugin install and dev-session lifecycle changes. */
  event: 'sero:plugins:event',
} as const;

export const agentPluginIpcChannels = {
  list: 'sero:agent-plugins:list',
  inspectSource: 'sero:agent-plugins:inspect-source',
  install: 'sero:agent-plugins:install',
  previewUpdate: 'sero:agent-plugins:preview-update',
  update: 'sero:agent-plugins:update',
  setEnabled: 'sero:agent-plugins:set-enabled',
  setCliExposure: 'sero:agent-plugins:set-cli-exposure',
  approveComponents: 'sero:agent-plugins:approve-components',
  remove: 'sero:agent-plugins:remove',
  reveal: 'sero:agent-plugins:reveal',
  event: 'sero:agent-plugins:event',
} as const;
