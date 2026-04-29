/**
 * Centralized UI selectors for Sero e2e tests.
 *
 * Keeps selectors in one place so tests stay readable and
 * refactoring the UI only requires updating this file.
 */

// ── Layout ──────────────────────────────────────────────────────

export const layout = {
  /** The outermost app shell. */
  appShell: 'div.flex.h-screen',
  /** Title bar (drag region). */
  titleBar: 'header.title-bar',
  /** Toggle left sidebar button. */
  sidebarToggle: 'button[aria-label="Toggle sidebar"]',
  /** Toggle right chat panel button. */
  chatToggle: 'button[aria-label="Toggle agent"]',
  /** Status bar footer. */
  statusBar: 'footer',

  // ── Resizable panels (data-testid from react-resizable-panels) ──
  /** The top-level horizontal panel group in App.tsx. */
  shellPanelGroup: '[data-testid="app-shell-panels"]',
  /** Main sidebar panel (left, collapsible). */
  sidebarPanel: '[data-testid="main-sidebar-panel"]',
  /** Active app panel (center). */
  activeAppPanel: '[data-testid="active-app-panel"]',
  /** Chat panel (right, collapsible). */
  chatPanel: '[data-testid="chat-panel"]',
  /** Handle between sidebar and active-app. */
  sidebarHandle: '[data-testid="app-shell-panels"] [data-separator]',
  /** ExplorerWorkspace vertical panel group. */
  explorerVerticalGroup: '[data-testid="explorer-vertical"]',
  /** ExplorerWorkspace terminal panel. */
  terminalPanel: '[data-testid="explorer-terminal"]',
} as const;

// ── Sidebar ─────────────────────────────────────────────────────

export const sidebar = {
  /** Search sessions input. */
  searchInput: 'input[placeholder="Search sessions…"]',
  /** "New session" button inside a workspace node. */
  newSessionButton: 'button[title="New session"]',
  /** Session list item — use `.filter({ hasText })` for specific session. */
  sessionItem: '[data-testid="session-item"]',
} as const;

// ── Chat Panel ──────────────────────────────────────────────────

export const chat = {
  /** The chat message input textarea. */
  input: 'textarea[name="message"]',
  /** Submit button (visible when not streaming). */
  submitButton: 'button[aria-label="Submit"]',
  /** Stop button (visible when streaming). */
  stopButton: 'button[aria-label="Stop"]',
  /** Agent streaming spinner. */
  streamingSpinner: '[class*="animate-spin"]',
  /** Empty state message when no session is selected. */
  emptyNoSession: 'text=Select or create a chat to begin',
  /** Empty state when session has no messages. */
  emptyNoMessages: 'text=Start a conversation',
  /** User message bubble container. */
  userMessage: '[data-testid="user-message"]',
  /** Assistant message bubble container. */
  assistantMessage: '[data-testid="assistant-message"]',
  /** Checkpoint restore button on user messages. */
  restoreButton: 'button[title="Revert to this point"]',
  /** Error display in chat. */
  errorMessage: '[data-testid="chat-error"]',
} as const;


// ── VCS / Checkpoints ───────────────────────────────────────────

export const vcs = {
  /** The VCS panel container. */
  panel: '[data-testid="vcs-panel"]',
  /** Checkpoint description input. */
  descriptionInput: 'input[placeholder="Checkpoint description (optional)"]',
  /** Create checkpoint button. */
  createButton: 'button:has-text("Checkpoint")',
  /** Refresh checkpoints button. */
  refreshButton: 'button:has-text("Refresh")',
  /** Individual checkpoint item. */
  checkpointItem: '[data-testid="checkpoint-item"]',
  /** Restore button on a checkpoint. */
  restoreCheckpointButton: 'button:has-text("Restore")',
  /** Diff view container. */
  diffView: '[data-testid="vcs-diff"]',
  /** Loading state text. */
  loading: 'text=Loading checkpoints…',
  /** Empty state text. */
  empty: 'text=No checkpoints yet.',
  /** VCS change ID in status bar. */
  statusBarChangeId: '[data-testid="vcs-change-id"]',
} as const;

// ── Workspace ───────────────────────────────────────────────────

export const workspace = {
  /** Add workspace button. */
  addButton: 'button[title="Add workspace folder"]',
  /** Workspace node in sidebar — use `.filter({ hasText })` for specific workspace. */
  workspaceNode: '[data-testid="workspace-node"]',
  /** Workspace node by ID — use workspace.nodeById(id). */
  nodeById: (id: string) => `[data-testid="workspace-node-${id}"]`,
} as const;

// ── File Tree ───────────────────────────────────────────────────

export const fileTree = {
  /** The file tree container. */
  container: '[data-testid="file-tree"]',
  /** Sidebar content area (explorer panel body). */
  sidebarContent: '[data-testid="explorer-sidebar-content"]',
  /** File tree item by filename. */
  itemByName: (name: string) => `[data-testid="file-tree-item-${name}"]`,
} as const;

