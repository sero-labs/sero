/**
 * IPC channel constants — single source of truth.
 *
 * Shared by Electron main process, preload, and renderer.
 * Extracted from ipc.ts to keep that file under 500 LOC.
 */

import { appAgentIpcChannels } from './ipc-channels-app-agent';
import { agentNodeIpcChannels } from './ipc-channels-agent-node';
import { workspaceIpcChannels } from './ipc-channels-workspace';
import { vcsIpcChannels } from './ipc-channels-vcs';
import { browserIpcChannels } from './ipc-channels-browser';
import { localModelsIpcChannels } from './ipc-channels-local-models';
import { agentPluginIpcChannels, pluginIpcChannels } from './ipc-channels-plugins';
import {
  feedbackIpcChannels,
  gatewayIpcChannels,
  githubIpcChannels,
  netIpcChannels,
  pluginConfigIpcChannels,
  safeStorageIpcChannels,
} from './ipc-channels-platform';

export const IpcChannels = {
  agentNode: agentNodeIpcChannels,
  workspace: workspaceIpcChannels,
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
    /** Undo a user turn: restore files, rewind the session tree, and prefill the composer. */
    undoToTurn: 'sero:agent:undo-to-turn',
  },
  contextPresets: {
    /** Load all user-saved context editor presets from disk. */
    load: 'sero:context-presets:load',
    /** Save all user context editor presets to disk. */
    save: 'sero:context-presets:save',
  },
  window: {
    /** Minimize the window (custom window controls on Linux). */
    minimize: 'sero:window:minimize',
    /** Toggle maximize/restore (custom window controls on Linux). */
    toggleMaximize: 'sero:window:toggle-maximize',
    /** Close the window (custom window controls on Linux). */
    close: 'sero:window:close',
    /** Query current maximize state. */
    isMaximized: 'sero:window:is-maximized',
    /** Main → renderer: maximize state changed. */
    maximizedChanged: 'sero:window:maximized-changed',
    /** Re-sync the Windows title-bar overlay colors after a theme change. */
    setOverlayColors: 'sero:window:set-overlay-colors',
    /** Main → renderer: zoom command from the application menu ('in' | 'out' | 'reset'). */
    zoomCommand: 'sero:window:zoom-command',
  },
  shell: {
    /** Open a path in the native file explorer. */
    showItemInFolder: 'sero:shell:show-item-in-folder',
    /** Open an external URL in the default browser. */
    openExternal: 'sero:shell:open-external',
    /** Clear the renderer HTTP cache after Vite dependency re-optimization. */
    clearRendererCache: 'sero:shell:clear-renderer-cache',
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
  appAgent: appAgentIpcChannels,
  webApp: {
    /** Run a direct Web app action for a workspace. */
    run: 'sero:web-app:run',
  },
  models: {
    /** List all available models (session-independent). Returns AvailableModelGroup[]. */
    list: 'sero:models:list',
  },
  subagentContext: {
    /** Available context (tools + skills) for a workspace's background subagents, no session. */
    get: 'sero:subagent-context:get',
  },
  modelConfig: {
    get: 'sero:model-config:get',
    set: 'sero:model-config:set',
  },
  onboarding: {
    getState: 'sero:onboarding:get-state',
  },
  localModels: localModelsIpcChannels,
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
    /** Respond to a pending selection during login. */
    respondSelect: 'sero:auth:respond-select',
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
  dashboard: {
    /** Persist or clear the host dashboard background image. */
    setBackground: 'sero:dashboard:set-background',
    /** Load the persisted host dashboard background image. */
    getBackground: 'sero:dashboard:get-background',
    /** Main → renderer push: dashboard background changed. */
    backgroundChanged: 'sero:dashboard:background-changed',
  },
  browser: browserIpcChannels,
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
    /** Get all roots (primary + additional) attached to a workspace. */
    getRoots: 'sero:editor:get-roots',
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
  vcs: vcsIpcChannels,
  orchestrator: {
    /** Route an Agent Board action to a workspace's orchestrator coordinator. */
    action: 'sero:orchestrator:action',
  },
  github: githubIpcChannels,
  net: netIpcChannels,
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
    /** Renderer-only: approve ONE runtime skill write, bound to a draft and its content. */
    approveSkillWrite: 'sero:skills:approve-write',
    deleteSkill: 'sero:skills:delete',
  },
  prompts: {
    listPrompts: 'sero:prompts:list',
    readPrompt: 'sero:prompts:read',
    writePrompt: 'sero:prompts:write',
    deletePrompt: 'sero:prompts:delete',
  },
  pluginConfig: pluginConfigIpcChannels,
  safeStorage: safeStorageIpcChannels,
  feedback: feedbackIpcChannels,
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
  notifications: {
    /** Renderer → main: read the feed, newest first. */
    list: 'sero:notifications:list',
    /** Renderer → main: mark entries read. */
    markRead: 'sero:notifications:mark-read',
    /** Renderer → main: how many entries are unread. */
    unreadCount: 'sero:notifications:unread-count',
    /** Main → renderer push: a new entry was added. */
    added: 'sero:notifications:added',
    /** Main → renderer push: entries were marked read, here or elsewhere. */
    read: 'sero:notifications:read',
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
  gateway: gatewayIpcChannels,
  plugins: pluginIpcChannels,
  agentPlugins: agentPluginIpcChannels,
  appControl: {
    /** List all available apps with manifest info. */
    list: 'sero:app-control:list',
    /** Get the currently active app ID. */
    active: 'sero:app-control:active',
    /** Switch to a specific app by ID. */
    open: 'sero:app-control:open',
    /** Get detailed info for an app by ID. */
    info: 'sero:app-control:info',
    /** Open a workspace file in the explorer editor. */
    openFile: 'sero:app-control:open-file',
    /** Capture the app panel as base64 PNG. */ screenshot: 'sero:app-control:screenshot',
    captureRegion: 'sero:app-control:capture-region', // Window-relative, constrained to the app panel.
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
    /** Remove an inactive profile. Args: id, mode. */
    remove: 'sero:profiles:remove',
    /** Open native folder picker for custom profile path. */
    pickFolder: 'sero:profiles:pick-folder',
    /** Check if onboarding is needed (no .onboarding-complete marker). */
    needsOnboarding: 'sero:profiles:needs-onboarding',
    /** Mark onboarding as complete (persists across restarts). */
    markOnboardingDone: 'sero:profiles:mark-onboarding-done',
    /** List profiles that have transferable credentials/config (for import during creation). */
    listAuthSources: 'sero:profiles:list-auth-sources',
  },
  doctor: {
    /** Run a full doctor pass. Streams progress on `event`. Returns final report. */
    run: 'sero:doctor:run',
    /** Run quick mode (≤ 2s). */
    runQuick: 'sero:doctor:run-quick',
    /** Save a previously returned report to a file via native dialog. */
    exportReport: 'sero:doctor:export-report',
    /** Copy report JSON or plaintext to clipboard. */
    copyReport: 'sero:doctor:copy-report',
    /** Main → renderer push: progress events during a run. */
    event: 'sero:doctor:event',
    /** Reserved for v2 — invoke a registered repair. Returns 501 in v1. */
    repair: 'sero:doctor:repair',
  },
  updater: {
    /** Trigger a manual update check. */
    check: 'sero:updater:check',
    /** Read the latest known updater status. */
    getStatus: 'sero:updater:get-status',
    /** Quit and install a downloaded update. */
    restart: 'sero:updater:restart',
    /** Main → renderer push: updater status changes. */
    event: 'sero:updater:event',
  },
} as const;
