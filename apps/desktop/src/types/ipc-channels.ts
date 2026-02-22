/**
 * IPC channel constants — single source of truth.
 *
 * Shared by Electron main process, preload, and renderer.
 * Extracted from ipc.ts to keep that file under 500 LOC.
 */
export const IpcChannels = {
  workspace: {
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
    /** Toggle container mode for a workspace. Args: id, enabled. */
    setContainer: 'sero:workspace:set-container',
  },
  sessions: {
    list: 'sero:sessions:list',
    create: 'sero:sessions:create',
    delete: 'sero:sessions:delete',
  },
  agent: {
    open: 'sero:agent:open',
    prompt: 'sero:agent:prompt',
    /** Steer the agent mid-stream (interrupt after current tool, skip remaining). */
    steer: 'sero:agent:steer',
    abort: 'sero:agent:abort',
    close: 'sero:agent:close',
    /** Get available slash commands for a session. */
    getCommands: 'sero:agent:get-commands',
    /** Reload resources (skills, prompts, extensions) for a session. Returns updated commands. */
    reloadResources: 'sero:agent:reload-resources',
    /** Get usage stats for a session. */
    getUsage: 'sero:agent:get-usage',
    /** Get current model + thinking state for a session. */
    getModelState: 'sero:agent:get-model-state',
    /** Set model for a session. Args: sessionId, provider, modelId. */
    setModel: 'sero:agent:set-model',
    /** Set thinking level for a session. Args: sessionId, level. */
    setThinkingLevel: 'sero:agent:set-thinking-level',
    /** Main → renderer push channel for streaming events. */
    event: 'sero:agent:event',
    /** Get session context (system prompt, tools, skills) for context editor. */
    getContext: 'sero:agent:get-context',
    /** Apply context overrides (disabled tools, system prompt override, etc.). */
    setContextOverrides: 'sero:agent:set-context-overrides',
    /** Restore a session to a checkpoint: VCS file restore + session branch. */
    restoreToCheckpoint: 'sero:agent:restore-to-checkpoint',
  },
  contextPresets: {
    /** Load all user-saved context editor presets from disk. */
    load: 'sero:context-presets:load',
    /** Save all user context editor presets to disk. */
    save: 'sero:context-presets:save',
  },
  shell: {
    /** Open a path in the native file explorer. */
    showItemInFolder: 'sero:shell:show-item-in-folder',
  },
  appState: {
    /** Read an app state JSON file. */
    read: 'sero:app-state:read',
    /** Write an app state JSON file (atomic). */
    write: 'sero:app-state:write',
    /** Delete an app state / data file. */
    remove: 'sero:app-state:remove',
    /** Start watching a state file. Returns current state. */
    watch: 'sero:app-state:watch',
    /** Stop watching a state file. */
    unwatch: 'sero:app-state:unwatch',
    /** Main → renderer: state file changed. */
    change: 'sero:app-state:change',
  },
  apps: {
    /** Discover all registered Sero apps. */
    discover: 'sero:apps:discover',
    /** Main → renderer push: new app package detected in packages/. */
    newAppDetected: 'sero:apps:new-app-detected',
  },
  appAgent: {
    /** Send a prompt to an app's dedicated agent session. Returns text response. */
    prompt: 'sero:app-agent:prompt',
  },
  imagegen: {
    /** Generate images via Gemini Nano Banana. Returns generation metadata. */
    generate: 'sero:imagegen:generate',
    /** Read a saved image file as a data URI. */
    readImage: 'sero:imagegen:read-image',
    /** Delete an image set by ID — removes from state and deletes files from disk. */
    deleteImage: 'sero:imagegen:delete-image',
  },
  voice: {
    /** Check whether voice transcription is available (requires OPENAI_API_KEY). */
    status: 'sero:voice:status',
    /** Transcribe audio via OpenAI Speech-to-Text. */
    transcribe: 'sero:voice:transcribe',
  },
  auth: {
    /** Get all providers (OAuth + API key) with auth status. */
    getProviders: 'sero:auth:get-providers',
    /** Start OAuth login for a provider. */
    login: 'sero:auth:login',
    /** Logout from a provider (OAuth or API key). */
    logout: 'sero:auth:logout',
    /** Save an API key for a provider. */
    setApiKey: 'sero:auth:set-api-key',
    /** Remove an API key for a provider. */
    removeApiKey: 'sero:auth:remove-api-key',
    /** Respond to a pending prompt during login. */
    respondPrompt: 'sero:auth:respond-prompt',
    /** Respond to a pending manual code input during login. */
    respondManualCode: 'sero:auth:respond-manual-code',
    /** Cancel in-progress login. */
    cancel: 'sero:auth:cancel',
    /** Main → renderer push channel for OAuth flow events. */
    event: 'sero:auth:event',
  },
  container: {
    /** Get container state for a workspace. Returns ContainerInfo | null. */
    status: 'sero:container:status',
    /** Detailed container inspection. */
    inspect: 'sero:container:inspect',
    /** Ensure a workspace container is running. Creates if needed. Returns ContainerInfo. */
    ensure: 'sero:container:ensure',
  },
  devServer: {
    /** List all registered dev servers. Optional workspaceId filter. */
    list: 'sero:dev-server:list',
    /** Stop a dev server by ID. */
    stop: 'sero:dev-server:stop',
    /** Restart a dev server by ID. */
    restart: 'sero:dev-server:restart',
    /** Unregister a dev server by ID (does not stop the process). */
    unregister: 'sero:dev-server:unregister',
    /** Open dev server URL in default browser. */
    openInBrowser: 'sero:dev-server:open-in-browser',
    /** Main → renderer push channel for dev server events. */
    event: 'sero:dev-server:event',
  },
  terminal: {
    /** Create a terminal session in a workspace container. */
    create: 'sero:terminal:create',
    /** Send input data to a terminal. */
    write: 'sero:terminal:write',
    /** Resize a terminal. */
    resize: 'sero:terminal:resize',
    /** Close a terminal session. */
    dispose: 'sero:terminal:dispose',
    /** Get buffered output for replay when xterm.js remounts. */
    replay: 'sero:terminal:replay',
    /** Main → renderer push: terminal output data. */
    data: 'sero:terminal:data',
    /** Main → renderer push: terminal process exited. */
    exit: 'sero:terminal:exit',
  },
  layout: {
    /** Save UI layout state (sidebar/panel open, etc.) */
    save: 'sero:layout:save',
    /** Load UI layout state. */
    load: 'sero:layout:load',
  },
  editor: {
    /** Read a file from the workspace (dual-mode: container or host). */
    readFile: 'sero:editor:read-file',
    /** Write a file to the workspace (dual-mode: container or host). */
    writeFile: 'sero:editor:write-file',
    /** List files in a directory (dual-mode: container or host). */
    listFiles: 'sero:editor:list-files',
    /** Execute a shell command in the workspace (dual-mode: container or host). */
    exec: 'sero:editor:exec',
    /** Save editor state (open tabs, active tab) for a workspace. */
    saveState: 'sero:editor:save-state',
    /** Load editor state for a workspace. */
    loadState: 'sero:editor:load-state',
    /** Get the root path for the file tree. */
    getRootPath: 'sero:editor:get-root-path',
    /** Check if a workspace uses containers. */
    isContainer: 'sero:editor:is-container',
    /** Rename/move a file or directory. */
    rename: 'sero:editor:rename',
    /** Delete a file or directory. */
    delete: 'sero:editor:delete',
    /** Create an empty file. */
    createFile: 'sero:editor:create-file',
    /** Create a directory. */
    createDir: 'sero:editor:create-dir',
  },
  filetree: {
    /** Start watching a workspace directory for changes. */
    watch: 'sero:filetree:watch',
    /** Stop watching a workspace directory. */
    unwatch: 'sero:filetree:unwatch',
    /** Main → renderer push: file tree directory changed. */
    changed: 'sero:filetree:changed',
  },
  lsp: {
    /** Start a language server for a workspace/language. */
    start: 'sero:lsp:start',
    /** Stop a language server. */
    stop: 'sero:lsp:stop',
    /** Send an LSP request. */
    request: 'sero:lsp:request',
    /** Send an LSP notification (no response). */
    notify: 'sero:lsp:notify',
    /** Check if a server is running. */
    hasServer: 'sero:lsp:has-server',
    /** Main → renderer push: LSP notification (diagnostics etc.). */
    notification: 'sero:lsp:notification',
    /** Main → renderer push: LSP server stopped. */
    serverStopped: 'sero:lsp:server-stopped',
  },
  debug: {
    /** Toggle debug logging on/off. Returns new enabled state. */
    toggle: 'sero:debug:toggle',
    /** Get current debug logging state. */
    getState: 'sero:debug:get-state',
    /** Open the log file in the native file explorer. */
    openLog: 'sero:debug:open-log',
    /** Clear the log file. */
    clearLog: 'sero:debug:clear-log',
    /** Main → renderer push: debug logging state changed. */
    stateChanged: 'sero:debug:state-changed',
  },
  vcs: {
    list: 'sero:vcs:list-checkpoints',
    state: 'sero:vcs:state',
    create: 'sero:vcs:create-checkpoint',
    restore: 'sero:vcs:restore',
    diff: 'sero:vcs:diff',
    watch: 'sero:vcs:watch',
    unwatch: 'sero:vcs:unwatch',
    event: 'sero:vcs:event',
    // Rich VCS operations
    logEntries: 'sero:vcs:log-entries',
    status: 'sero:vcs:status',
    fileDiffSummary: 'sero:vcs:file-diff-summary',
    fileContent: 'sero:vcs:file-content',
    describe: 'sero:vcs:describe',
    bookmarks: 'sero:vcs:bookmarks',
    createBookmark: 'sero:vcs:create-bookmark',
    deleteBookmark: 'sero:vcs:delete-bookmark',
    moveBookmark: 'sero:vcs:move-bookmark',
    remotes: 'sero:vcs:remotes',
    addRemote: 'sero:vcs:add-remote',
    removeRemote: 'sero:vcs:remove-remote',
    fetch: 'sero:vcs:fetch',
    push: 'sero:vcs:push',
    pushDryRun: 'sero:vcs:push-dry-run',
    prState: 'sero:vcs:pr-state',
    prPreview: 'sero:vcs:pr-preview',
    prGenerateDraft: 'sero:vcs:pr-generate-draft',
    prCreate: 'sero:vcs:pr-create',
    undo: 'sero:vcs:undo',
    abandon: 'sero:vcs:abandon',
    squash: 'sero:vcs:squash',
    opLog: 'sero:vcs:op-log',
  },
  github: {
    status: 'sero:github:status',
    login: 'sero:github:login',
    logout: 'sero:github:logout',
    cancel: 'sero:github:cancel',
    event: 'sero:github:event',
  },
  feedback: {
    /** Load all feedback entries from disk. */
    load: 'sero:feedback:load',
    /** Submit or update a single feedback entry. */
    submit: 'sero:feedback:submit',
    /** Remove a feedback entry by message ID. */
    remove: 'sero:feedback:remove',
  },
} as const;
