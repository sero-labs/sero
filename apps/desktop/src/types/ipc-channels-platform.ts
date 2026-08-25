/** Platform and integration IPC channel groups extracted from ipc-channels.ts. */

export const githubIpcChannels = {
  status: 'sero:github:status',
  login: 'sero:github:login',
  logout: 'sero:github:logout',
  cancel: 'sero:github:cancel',
  event: 'sero:github:event',
  /** Create a GitHub repository for a workspace. Args: workspaceId, input. */
  createRepo: 'sero:github:create-repo',
} as const;

export const netIpcChannels = {
  /** Proxy an HTTP fetch through the main process (bypasses CORS). */
  fetch: 'sero:net:fetch',
} as const;

export const pluginConfigIpcChannels = {
  /** Read a plugin's config. Args: pluginId. */
  read: 'sero:plugin-config:read',
  /** Write a plugin's config. Args: pluginId, config. */
  write: 'sero:plugin-config:write',
} as const;

export const safeStorageIpcChannels = {
  /** Encrypt a string via OS keychain (macOS Keychain / DPAPI). */
  encrypt: 'sero:safe-storage:encrypt',
  /** Decrypt a safeStorage-encrypted base64 string. */
  decrypt: 'sero:safe-storage:decrypt',
  /** Check if OS-level encryption is available. */
  available: 'sero:safe-storage:available',
  /** Report whether stored credentials are really protected, and why not. */
  status: 'sero:safe-storage:status',
} as const;

export const feedbackIpcChannels = {
  /** Load all feedback entries from disk. */
  load: 'sero:feedback:load',
  /** Submit or update a single feedback entry. */
  submit: 'sero:feedback:submit',
  /** Remove a feedback entry by message ID. */
  remove: 'sero:feedback:remove',
} as const;

export const gatewayIpcChannels = {
  /** Get gateway server status (running, port, clients). */
  getStatus: 'sero:gateway:get-status',
  /** Get the auth token for display / sharing. */
  getToken: 'sero:gateway:get-token',
  /** Enable or disable the gateway. */
  setEnabled: 'sero:gateway:set-enabled',
  /** Get current gateway configuration. */
  getConfig: 'sero:gateway:get-config',
  /** Update gateway configuration. */
  setConfig: 'sero:gateway:set-config',
  /** Main → renderer push channel for gateway events. */
  event: 'sero:gateway:event',
  /** Create a web access token (with optional label and expiry). */
  createWebToken: 'sero:gateway:create-web-token',
  /** List active web tokens. */
  listWebTokens: 'sero:gateway:list-web-tokens',
  /** Revoke a specific web token by ID. */
  revokeWebToken: 'sero:gateway:revoke-web-token',
  /** Generate a QR login URL + data URL for device pairing. */
  getQrLoginData: 'sero:gateway:get-qr-login-data',
} as const;
