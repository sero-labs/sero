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
  /** Open native folder picker dialog. Returns path or null. */
  pickFolder: 'sero:workspace:pick-folder',
  /** Infer best workspace for a given message. Returns workspace ID. */
  infer: 'sero:workspace:infer',
  /** Inspect desired vs actual runtime state for one workspace or all workspaces. */
  runtimeDiagnostics: 'sero:workspace:runtime-diagnostics',
  /** Toggle container mode for a workspace. Args: id, enabled. */
  setContainer: 'sero:workspace:set-container',
  setRuntime: 'sero:workspace:set-runtime',
  listOpenShellRemoteGateways: 'sero:workspace:openshell-remote-gateways:list',
  saveOpenShellRemoteGateway: 'sero:workspace:openshell-remote-gateways:save',
  removeOpenShellRemoteGateway: 'sero:workspace:openshell-remote-gateways:remove',
  testOpenShellRemoteGateway: 'sero:workspace:openshell-remote-gateways:test',
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
  /** Add an additional root to a workspace. Args: id, { name, path, kind? }. */
  addRoot: 'sero:workspace:add-root',
  /** Remove an additional root from a workspace. Args: id, rootId. */
  removeRoot: 'sero:workspace:remove-root',
  /** Rename the display name of a root. Args: id, rootId, newName. */
  renameRoot: 'sero:workspace:rename-root',
} as const;
