export const workspaceIpcChannels = {
  list: 'sero:workspace:list',
  create: 'sero:workspace:create',
  remove: 'sero:workspace:remove',
  getConfig: 'sero:workspace:get-config',
  addFolder: 'sero:workspace:add-folder',
  /** Open workspace in sidebar (persisted). */
  open: 'sero:workspace:open',
  /** Close workspace in sidebar (persisted). */
  close: 'sero:workspace:close',
  /** Delete workspace: unregister AND permanently remove its folder from disk. Destructive. */
  delete: 'sero:workspace:delete',
  /** Open native folder picker dialog. Returns path or null. */
  pickFolder: 'sero:workspace:pick-folder',
  /** Infer best workspace for a given message. Returns workspace ID. */
  infer: 'sero:workspace:infer',
  /** Inspect desired vs actual runtime state for one workspace or all workspaces. */
  runtimeDiagnostics: 'sero:workspace:runtime-diagnostics',
  getToolchainStatus: 'sero:workspace:get-toolchain-status',
  ensureCoreTools: 'sero:workspace:ensure-core-tools',
  toolchainProgress: 'sero:workspace:toolchain-progress',
  getBrowserPackStatus: 'sero:workspace:get-browser-pack-status',
  ensureBrowserPack: 'sero:workspace:ensure-browser-pack',
  uninstallBrowserPack: 'sero:workspace:uninstall-browser-pack',
  browserPackProgress: 'sero:workspace:browser-pack-progress',
  /** Get persisted runtime config for a workspace. */
  getRuntimeConfig: 'sero:workspace:get-runtime-config',
  setRuntimeBackend: 'sero:workspace:set-runtime-backend',
  /**
   * Toggle container mode for a workspace. Args: id, enabled.
   * @deprecated Compatibility channel; new callers must use `setRuntimeBackend` which can
   * select host / docker / apple-container explicitly.
   */
  setContainer: 'sero:workspace:set-container',
  /** Add a workspace reference (mount another workspace). Args: id, refId. */
  addReference: 'sero:workspace:add-reference',
  /** Remove a workspace reference. Args: id, refId. */
  removeReference: 'sero:workspace:remove-reference',
  /** Add an arbitrary folder mount. Args: id, folderPath. */
  addMount: 'sero:workspace:add-mount',
  /** Remove an arbitrary folder mount. Args: id, folderPath. */
  removeMount: 'sero:workspace:remove-mount',
  /** Set expanded/collapsed state for a workspace tree node. */
  setExpanded: 'sero:workspace:set-expanded',
  /** Main → renderer: workspace registry changed. */
  changed: 'sero:workspace:changed',
  /** List additional roots attached to a workspace. */
  listRoots: 'sero:workspace:list-roots',
  /** List primary/referenced/mounted/additional roots with runtime paths. */
  listAccessRoots: 'sero:workspace:list-access-roots',
  /** Add an additional root to a workspace. Args: id, { name, path, kind? }. */
  addRoot: 'sero:workspace:add-root',
  /** Remove an additional root from a workspace. Args: id, rootId. */
  removeRoot: 'sero:workspace:remove-root',
  /** Rename the display name of a root. Args: id, rootId, newName. */
  renameRoot: 'sero:workspace:rename-root',
} as const;
