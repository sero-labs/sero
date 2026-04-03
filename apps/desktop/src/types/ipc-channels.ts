/**
 * IPC channel constants — single source of truth.
 *
 * Shared by Electron main process, preload, and renderer.
 * Extracted from ipc.ts to keep that file under 500 LOC.
 */

import { localModelsIpcChannels } from './ipc-channels-local-models';

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
  },
  sessions: {
    list: 'sero:sessions:list',
    create: 'sero:sessions:create',
    delete: 'sero:sessions:delete',
    rename: 'sero:sessions:rename',
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
    /** Get context window usage for a session. */
    getContextUsage: 'sero:agent:get-context-usage',
    /** Trigger manual compaction. Args: sessionId, customInstructions?. */
    compact: 'sero:agent:compact',
    /** Clear session by branching from root. Args: sessionId. */
    clearSession: 'sero:agent:clear-session',
    /** Fork session: extract current branch to a new session file. Args: sessionId. */
    forkSession: 'sero:agent:fork-session',
    /** Get current model + thinking state for a session. */
    getModelState: 'sero:agent:get-model-state',
    /** Set model for a session. Args: sessionId, provider, modelId. */
    setModel: 'sero:agent:set-model',
    /** Set thinking level for a session. Args: sessionId, level. */
    setThinkingLevel: 'sero:agent:set-thinking-level',
    /** Notify that the user switched away from a session (triggers transcript export). */
    notifySessionSwitch: 'sero:agent:notify-session-switch',
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
    /** Read a file as raw UTF-8 text (no JSON parsing). */
    readText: 'sero:app-state:read-text',
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
    /** Send a prompt and stream text deltas back. Returns final text. */
    promptStream: 'sero:app-agent:prompt-stream',
    /** Push channel for text deltas during streaming. */
    streamEvent: 'sero:app-agent:stream-event',
  },
  gitApp: {
    /** Run a direct Git app action for a workspace. */
    run: 'sero:git-app:run',
  },
  models: {
    /** List all available models (session-independent). Returns AvailableModelGroup[]. */
    list: 'sero:models:list',
  },
  localModels: localModelsIpcChannels,
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
  themes: {
    /** List all available theme presets (built-in + custom). */
    list: 'sero:themes:list',
    /** Load a specific theme preset by ID. */
    load: 'sero:themes:load',
    /** Save a custom theme preset (create or update). */
    save: 'sero:themes:save',
    /** Delete a custom theme preset. */
    delete: 'sero:themes:delete',
    /** Import a theme from a file picker dialog. */
    import: 'sero:themes:import',
    /** Export a theme to a file save dialog. */
    export: 'sero:themes:export',
    /** Reset a built-in theme to its original template. */
    reset: 'sero:themes:reset',
  },
  editor: {
    /** Read a file from the workspace (dual-mode: container or host). */
    readFile: 'sero:editor:read-file',
    /** Read a binary file as base64 (for media/document previews). */
    readBinaryFile: 'sero:editor:read-binary-file',
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
    setRemoteUrl: 'sero:vcs:set-remote-url',
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
    /** Create a GitHub repository for a workspace. Args: workspaceId, input. */
    createRepo: 'sero:github:create-repo',
  },
  net: {
    /** Proxy an HTTP fetch through the main process (bypasses CORS). */
    fetch: 'sero:net:fetch',
  },
  subagent: {
    event: 'sero:subagent:event',
    listAgents: 'sero:subagent:list-agents',
    snapshot: 'sero:subagent:snapshot',
    abort: 'sero:subagent:abort',
    clearCompleted: 'sero:subagent:clear-completed',
    readAgent: 'sero:subagent:read-agent',
    writeAgent: 'sero:subagent:write-agent',
    deleteAgent: 'sero:subagent:delete-agent',
  },
  skills: {
    listSkills: 'sero:skills:list',
    listAvailableSkills: 'sero:skills:list-available',
    setDisabledModelSkills: 'sero:skills:set-disabled-model-skills',
    readSkill: 'sero:skills:read',
    writeSkill: 'sero:skills:write',
    deleteSkill: 'sero:skills:delete',
  },
  prompts: {
    listPrompts: 'sero:prompts:list',
    readPrompt: 'sero:prompts:read',
    writePrompt: 'sero:prompts:write',
    deletePrompt: 'sero:prompts:delete',
  },
  google: {
    /** Execute a gogcli data command (gog --json --no-input <service> <args>). */
    execute: 'sero:google:execute',
    /** Get Google auth status (configured, authenticated, email). */
    authStatus: 'sero:google:auth-status',
    /** Start Google OAuth2 sign-in flow (opens browser). */
    login: 'sero:google:login',
    /** Sign out of Google. */
    logout: 'sero:google:logout',
    /** Main → renderer push: auth flow progress events. */
    authEvent: 'sero:google:auth-event',
  },
  safeStorage: {
    /** Encrypt a string via OS keychain (macOS Keychain / DPAPI). */
    encrypt: 'sero:safe-storage:encrypt',
    /** Decrypt a safeStorage-encrypted base64 string. */
    decrypt: 'sero:safe-storage:decrypt',
    /** Check if OS-level encryption is available. */
    available: 'sero:safe-storage:available',
  },
  feedback: {
    /** Load all feedback entries from disk. */
    load: 'sero:feedback:load',
    /** Submit or update a single feedback entry. */
    submit: 'sero:feedback:submit',
    /** Remove a feedback entry by message ID. */
    remove: 'sero:feedback:remove',
  },
  userFeedback: {
    /** Main → renderer push: a question or questionnaire is pending. */
    question: 'sero:user-feedback:question',
    /** Main → renderer push: a pending question was cancelled (e.g. tool aborted). */
    cancel: 'sero:user-feedback:cancel',
    /** Renderer → main: user answered a pending question. */
    answer: 'sero:user-feedback:answer',
    /** Renderer → main: get all currently pending questions (for mount-time hydration). */
    getPending: 'sero:user-feedback:get-pending',
  },
  artifacts: {
    /** List all artifacts, optionally filtered by session. */
    list: 'sero:artifacts:list',
    /** Get a single artifact by ID. */
    get: 'sero:artifacts:get',
    /** Remove an artifact by ID. */
    remove: 'sero:artifacts:remove',
    /** Clear all artifacts for a session. */
    clearSession: 'sero:artifacts:clear-session',
    /** Main → renderer push channel for artifact events. */
    event: 'sero:artifacts:event',
  },
  collaboration: {
    /** Send a prompt through the 4-agent collaboration framework. */
    prompt: 'sero:collaboration:prompt',
    /** Get the latest collaboration runtime snapshot for a session. */
    getState: 'sero:collaboration:get-state',
    /** Main → renderer push channel for collaboration lifecycle events. */
    event: 'sero:collaboration:event',
  },
  gateway: {
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
  },
  plugins: {
    /** Install a plugin from a source (npm:, git:, or local path). */
    install: 'sero:plugins:install',
    /** Uninstall a plugin by ID. */
    uninstall: 'sero:plugins:uninstall',
    /** List all installed plugins. */
    list: 'sero:plugins:list',
    /** Check if a specific app is an installed plugin. */
    isPlugin: 'sero:plugins:is-plugin',
    /** Search for public plugins on GitHub (topic) and npm (keyword). */
    search: 'sero:plugins:search',
    /** Main → renderer push: plugin installed or uninstalled. */
    event: 'sero:plugins:event',
  },
  appControl: {
    /** List all available apps with manifest info. */
    list: 'sero:app-control:list',
    /** Get the currently active app ID. */
    active: 'sero:app-control:active',
    /** Switch to a specific app by ID. */
    open: 'sero:app-control:open',
    /** Get detailed info for an app by ID. */
    info: 'sero:app-control:info',
    /** Open a workspace file in the coding editor. */
    openFile: 'sero:app-control:open-file',
    /** Capture a screenshot of the app panel area. Returns base64 PNG. */
    screenshot: 'sero:app-control:screenshot',
    /** Execute a DOM interaction in the app panel. */
    interact: 'sero:app-control:interact',
    /** Get the app panel's bounding rect (for capturePage). */
    getAppRect: 'sero:app-control:get-app-rect',
    /** Start screen recording of the app panel. */
    recordStart: 'sero:app-control:record-start',
    /** Stop screen recording. Returns saved directory path. */
    recordStop: 'sero:app-control:record-stop',
    /** Get current recording status. */
    recordStatus: 'sero:app-control:record-status',
  },
  profiles: {
    /** List all profiles with active flag. */
    list: 'sero:profiles:list',
    /** Get the currently active profile. */
    getActive: 'sero:profiles:get-active',
    /** Check if a valid active profile exists. */
    hasActive: 'sero:profiles:has-active',
    /** Create a new profile. Args: name, path?. */
    create: 'sero:profiles:create',
    /** Switch to a profile (triggers app restart). Args: id. */
    switch: 'sero:profiles:switch',
    /** Rename a profile. Args: id, newName. */
    rename: 'sero:profiles:rename',
    /** Delete a profile (unregister only). Args: id. */
    delete: 'sero:profiles:delete',
    /** Open native folder picker for custom profile path. */
    pickFolder: 'sero:profiles:pick-folder',
    /** Check if onboarding is needed (no .onboarding-complete marker). */
    needsOnboarding: 'sero:profiles:needs-onboarding',
    /** Mark onboarding as complete (persists across restarts). */
    markOnboardingDone: 'sero:profiles:mark-onboarding-done',
    /** List other profiles that have auth.json (for import during creation). */
    listAuthSources: 'sero:profiles:list-auth-sources',
  },
} as const;
