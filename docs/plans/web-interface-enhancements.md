# Web Interface Enhancements — Implementation Plan

## Current State

The web interface (`electron/gateway/channels/web.ts`) is a minimal single-file HTML page with inline JS served by the gateway HTTP server. It provides:

- Manual token entry via a password field overlay
- Basic WebSocket connection to the gateway (port 18800/18801)
- Simple text-only chat: user messages, plain-text agent responses, tool call summaries
- Auto-selects first workspace, hardcoded `sessionId = 'web-' + Date.now()`
- No token persistence (re-entered every page load)
- No workspace/session management UI
- No file browsing, no image rendering, no markdown

## Architecture Decision

**Build the enhanced web UI as a separate Vite-built SPA** served by the gateway, rather than continuing to grow the inline HTML string. This gives us:

- TypeScript, JSX, Tailwind, component reuse from the desktop app's `@sero-ai/ui`
- Shared shadcn/ui primitives and ai-elements conversation components
- Code splitting, HMR during development
- Proper testing with Vitest

The SPA will be built into `apps/desktop/electron/gateway/web-dist/` and served as static files by the gateway HTTP server. The existing inline HTML approach will be kept as a minimal fallback (e.g., for diagnostics) at `/basic`.

### New Package: `apps/web-remote/`

```
apps/web-remote/
├── package.json          # @sero/web-remote
├── tsconfig.json
├── vite.config.ts        # Outputs to ../desktop/electron/gateway/web-dist/
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── lib/
│   │   ├── gateway-client.ts    # WebSocket client wrapper
│   │   ├── token-storage.ts     # Secure token persistence
│   │   └── file-api.ts          # File browsing over gateway
│   ├── stores/
│   │   ├── connection.ts        # Zustand: WS state, auth, token
│   │   ├── workspace.ts         # Zustand: workspace + session list
│   │   ├── chat.ts              # Zustand: messages, streaming state
│   │   └── files.ts             # Zustand: file tree, preview content
│   ├── components/
│   │   ├── AuthScreen.tsx       # Token entry + QR scanner
│   │   ├── WorkspacePicker.tsx  # Workspace + session selector
│   │   ├── ChatPanel.tsx        # Rich chat (reuses ai-elements)
│   │   ├── ChatMessage.tsx      # Message renderer (markdown, images)
│   │   ├── ToolCallDisplay.tsx  # Collapsible tool call groups
│   │   ├── FileBrowser.tsx      # Read-only file tree
│   │   ├── FilePreview.tsx      # Code/image/text preview
│   │   ├── ArtifactGallery.tsx  # Screenshot/image viewer
│   │   ├── Layout.tsx           # Shell: sidebar + chat + panels
│   │   └── StatusBar.tsx        # Connection status, workspace info
│   └── hooks/
│       └── useGateway.ts        # Convenience hook for gateway state
```

---

## Feature 1: QR Code Token with 7-Day Expiry & Secure Storage

### Problem
Currently, the gateway uses a single permanent token (`~/.sero-ui/gateway-token`). Users must manually re-enter it on every page load. There's no way to share it conveniently (e.g., from desktop to phone).

### Design

#### 1a. Web Tokens with Expiry (Server Side)

**New file: `electron/gateway/web-tokens.ts`**

Introduce a separate "web token" system alongside the existing gateway token:

```typescript
interface WebToken {
  token: string;       // 32-byte random hex
  createdAt: string;   // ISO timestamp
  expiresAt: string;   // ISO timestamp (createdAt + 7 days)
  label: string;       // "QR-generated <date>" or user-provided
}
```

- Web tokens are stored in `~/.sero-ui/gateway-web-tokens.json` (mode `0o600`)
- The gateway `GatewayAuth.validate()` is extended to accept either the master token OR any valid (non-expired) web token
- Web tokens can be revoked individually or all-at-once from the desktop app
- Maximum 10 active web tokens (old ones auto-pruned)
- Expired tokens are cleaned up on startup and periodically

**New gateway protocol messages:**

```typescript
// Client → Gateway (requires master token auth first)
{ type: 'create_web_token', label?: string, expiryDays?: number }

// Gateway → Client
{ type: 'ok', requestType: 'create_web_token', data: { token: string, expiresAt: string } }

// Client → Gateway
{ type: 'list_web_tokens' }
{ type: 'revoke_web_token', tokenId: string }
```

#### 1b. QR Code Generation (Desktop App Side)

**Changes to `electron/ipc/gateway.ts`:**

- New IPC handler: `sero:gateway:create-web-token` — generates a web token and returns it
- New IPC handler: `sero:gateway:list-web-tokens` — lists active web tokens
- New IPC handler: `sero:gateway:revoke-web-token` — revokes a specific token

**Desktop UI: Gateway Settings panel (new component or addition to existing settings)**

- "Generate Web Access Token" button
- Displays QR code containing: `sero://<host>:<port>?token=<web-token>`
  - Uses `qrcode` npm package (lightweight, no-dependency QR generator)
  - QR encodes a URL scheme, NOT the raw token — this allows the web app to auto-parse
- Shows expiry date, label, and a "Revoke" button for each token
- QR code is displayed in a modal, easily scannable from a phone

**Dependency: `qrcode` (npm)**
- Add to `apps/desktop/package.json` (desktop side generates the QR)
- Alternatively, generate QR as SVG string server-side and serve via an endpoint

#### 1c. Secure Token Storage (Web Client Side)

**File: `apps/web-remote/src/lib/token-storage.ts`**

The web client stores the token using the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) + IndexedDB:

1. On first successful auth, derive an encryption key from the gateway URL (as a "domain binding" salt) using PBKDF2
2. Encrypt the token with AES-GCM using the derived key
3. Store the encrypted blob in IndexedDB (not localStorage — banned by CLAUDE.md for the desktop app, and IndexedDB is more appropriate for binary data in the web app anyway)
4. On page load, check IndexedDB for a stored token → attempt auto-connect
5. If the token is expired or rejected (gateway returns auth error), clear storage and show the auth screen

**Why not just `localStorage`?**
- The CLAUDE.md ban is specific to the Electron renderer (where filesystem-backed state is preferred), but for the standalone web app, we still want defense-in-depth
- IndexedDB + encryption means a compromised browser extension or XSS can't trivially exfiltrate the token
- Token expiry (7 days) limits the blast radius even if the encrypted blob is stolen

---

## Feature 2: Workspace & Session Management

### Problem
The current web UI auto-selects the first workspace and creates a throwaway session ID. No ability to switch workspaces, see existing sessions, or create/resume sessions.

### Design

#### 2a. Gateway Protocol Extensions

The existing protocol already has `list_workspaces` and `list_sessions`. We need to add:

```typescript
// Client → Gateway
{ type: 'create_session', workspaceId: string, name?: string }
{ type: 'switch_workspace', workspaceId: string }

// Gateway → Client
{ type: 'ok', requestType: 'create_session', data: { sessionId: string, name: string } }
```

**Extend `GatewayAgentOps`:**

```typescript
interface GatewayAgentOps {
  // existing...
  createSession(workspaceId: string, name?: string): Promise<{ id: string; name: string }>;
}
```

#### 2b. Web UI Components

**`WorkspacePicker.tsx`** — sidebar panel:
- Dropdown or list of workspaces (fetched via `list_workspaces`)
- Shows workspace name + path
- Active workspace highlighted
- Below: session list for the active workspace (fetched via `list_sessions`)
- Each session shows name/first-message preview, click to switch
- "New Session" button at the top
- Active session highlighted with a visual indicator

**`stores/workspace.ts`** — Zustand store:
```typescript
interface WorkspaceState {
  workspaces: Array<{ id: string; name: string; path: string }>;
  activeWorkspaceId: string | null;
  sessions: Array<{ id: string; name: string }>;
  activeSessionId: string | null;
  fetchWorkspaces: () => Promise<void>;
  fetchSessions: (workspaceId: string) => Promise<void>;
  setActiveWorkspace: (id: string) => void;
  setActiveSession: (id: string) => void;
  createSession: (name?: string) => Promise<void>;
}
```

---

## Feature 3: Rich Chat UI

### Problem
The current web UI renders all messages as plain text `<div>` elements. No markdown, no code highlighting, no image rendering, no collapsible tool calls, no streaming indicators.

### Design

#### 3a. Reuse ai-elements Components

The desktop app uses `@sero-ai/ui/components/ai-elements/` for its conversation UI. These are React components already in the monorepo. The web-remote app can import them directly since it's a Vite SPA in the same monorepo.

**Shared components to reuse:**
- `Conversation`, `ConversationContent`, `ConversationScrollButton` — scroll container + auto-scroll
- `Message` — message bubble wrapper
- `PromptInput` — rich text input with action menu

**New web-specific components (can't reuse desktop versions because they depend on Electron IPC):**

- **`ChatMessage.tsx`** — renders a single message:
  - User messages: simple styled bubble
  - Assistant messages: markdown rendering (using `react-markdown` + `rehype-highlight` for code blocks)
  - Supports inline images (base64 or URL)
  - Shows thinking blocks (collapsible) when present

- **`ToolCallDisplay.tsx`** — collapsible tool call groups:
  - Groups consecutive tool calls (same logic as desktop's `groupMessages()`)
  - Shows tool name + status icon (spinner for running, check for done, X for error)
  - Expandable output preview (truncated by default)

#### 3b. Gateway Protocol — Richer Events

Extend the push events to carry more information:

```typescript
// New: Carry markdown content type info
interface GatewayTextDeltaEvent {
  type: 'text_delta';
  sessionId: string;
  delta: string;
  // No changes needed — markdown is rendered client-side
}

// New: Tool input params (for display)
interface GatewayToolStartEvent {
  type: 'tool_start';
  sessionId: string;
  toolName: string;
  toolCallId: string;
  input?: Record<string, unknown>;  // NEW: tool input params for display
}
```

#### 3c. Chat Store

**`stores/chat.ts`:**
```typescript
interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  text: string;
  isStreaming: boolean;
  thinking?: string;
  images?: Array<{ base64: string; mimeType: string }>;
  timestamp: number;
}

interface ToolCall {
  toolCallId: string;
  toolName: string;
  input?: Record<string, unknown>;
  state: 'running' | 'done' | 'error';
  output?: string;
}

interface ChatState {
  messages: ChatMessage[];
  toolCalls: ToolCall[];
  isStreaming: boolean;
  // ... actions for handling gateway push events
}
```

---

## Feature 4: File Browser & Preview (Read-Only)

### Problem
No way to browse workspace files from the web interface. The desktop app has a full file tree (`FileTree.tsx`) with editing capabilities, but we only need read-only browsing.

### Design

#### 4a. Gateway Protocol — File Operations

New request types:

```typescript
// Client → Gateway
{ type: 'list_files', workspaceId: string, path: string }
// → Returns directory listing

{ type: 'read_file', workspaceId: string, path: string }
// → Returns file content (text or base64 for binary)

// Gateway → Client
{ type: 'ok', requestType: 'list_files', data: Array<{ name: string, type: 'file'|'directory', size: number }> }
{ type: 'ok', requestType: 'read_file', data: { content: string, encoding: 'utf8'|'base64', mimeType: string, size: number } }
```

**Server-side implementation** (`electron/gateway/request-handler.ts`):

- `list_files` → reads the workspace directory (via container if active, or direct fs for non-containerized workspaces)
- `read_file` → reads file content with size limit (1 MB for text, 5 MB for images)
- Both respect `.gitignore` patterns and skip hidden directories (`.git`, `node_modules`)
- Security: path traversal prevention — resolved paths must stay within the workspace root

**Extend `GatewayAgentOps`:**
```typescript
interface GatewayAgentOps {
  // existing...
  listFiles(workspaceId: string, path: string): Promise<FileEntry[]>;
  readFile(workspaceId: string, path: string): Promise<FileContent>;
}
```

#### 4b. Web UI Components

**`FileBrowser.tsx`** — collapsible sidebar panel:
- Tree view with expand/collapse for directories
- File icons by extension (reuse `file-icons.tsx` from desktop)
- Click file → opens preview in main panel
- Breadcrumb path navigation at the top
- Search/filter input for quick file finding

**`FilePreview.tsx`** — main content area:
- Code files: syntax-highlighted with line numbers (using `highlight.js` or `shiki`)
- Images: rendered inline with zoom controls
- Text files: plain monospace display
- Binary files: show file info (size, type) with no preview
- Tab bar for multiple open files (session-scoped, not persisted)

**`stores/files.ts`:**
```typescript
interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  children?: FileEntry[]; // Lazy-loaded
}

interface FileState {
  tree: Record<string, FileEntry[]>; // path → children
  openFiles: Array<{ path: string; content: string; mimeType: string }>;
  activeFilePath: string | null;
  expandedDirs: Set<string>;
  fetchDirectory: (path: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
}
```

---

## Feature 5: Image/Screenshot Viewing

### Problem
The agent creates screenshots and artifacts during sessions (stored in `ArtifactRegistry`). The web UI can't view these — `artifact_added` events are already forwarded but the web client ignores them.

### Design

#### 5a. Gateway Protocol — Artifact Retrieval

```typescript
// Client → Gateway
{ type: 'list_artifacts', sessionId: string }
{ type: 'get_artifact', artifactId: string }

// Gateway → Client
{ type: 'ok', requestType: 'list_artifacts', data: Artifact[] }
{ type: 'ok', requestType: 'get_artifact', data: { base64: string, mimeType: string, title: string } }
```

**Server-side:** Wire through to `ArtifactRegistry` methods that already exist:
- `listBySession(sessionId)` → returns artifact metadata
- `get(artifactId)` → returns full artifact including base64 data

Extend `GatewayAgentOps`:
```typescript
interface GatewayAgentOps {
  // existing...
  listArtifacts(sessionId: string): Promise<Artifact[]>;
  getArtifact(artifactId: string): Promise<Artifact | null>;
}
```

#### 5b. Inline Image Rendering in Chat

When the agent produces a screenshot (tool_end for `screenshot` / `browser_screenshot`), and we receive an `artifact_added` push event:

1. The chat store listens for `artifact_added` events
2. Inserts an image placeholder message into the chat at the current position
3. Lazily fetches the artifact data via `get_artifact` when the image scrolls into view (IntersectionObserver)
4. Renders as an inline `<img>` with click-to-zoom (lightbox)

#### 5c. Artifact Gallery Panel

**`ArtifactGallery.tsx`** — accessible via a toolbar button:
- Grid view of all artifacts for the current session
- Thumbnail previews (lazy-loaded)
- Click → full-size lightbox with navigation (prev/next)
- Shows title, timestamp, type badge
- Filter by type (screenshot, log, video)

---

## Implementation Phases

### Phase 1: Foundation (estimated: ~3 days)
1. Create `apps/web-remote/` package with Vite + React + Tailwind + Zustand
2. Set up build pipeline to output to `electron/gateway/web-dist/`
3. Update gateway HTTP server to serve static files from `web-dist/`
4. Implement `gateway-client.ts` WebSocket wrapper
5. Implement `token-storage.ts` (IndexedDB + Web Crypto)
6. Build `AuthScreen.tsx` with manual token entry (QR scanning comes in Phase 2)
7. Basic connection flow: auth → workspace list → session creation

### Phase 2: QR Tokens & Auth (estimated: ~2 days)
1. Implement `web-tokens.ts` server-side token management
2. Extend `GatewayAuth.validate()` for web tokens
3. Add IPC handlers for token management
4. Add `qrcode` dependency, build QR generation in desktop settings
5. Build QR display modal in desktop app
6. Update web `AuthScreen` with QR scanning (using `html5-qrcode` or camera API)
7. Auto-connect on page load from stored token

### Phase 3: Workspace & Session Management (estimated: ~2 days)
1. Extend gateway protocol with `create_session`
2. Implement `WorkspacePicker.tsx` sidebar
3. Wire up `stores/workspace.ts`
4. Session switching, creation, and listing
5. Build responsive `Layout.tsx` shell

### Phase 4: Rich Chat (estimated: ~3 days)
1. Set up shared ui-elements imports in web-remote
2. Build `ChatMessage.tsx` with markdown rendering
3. Build `ToolCallDisplay.tsx` with collapsible groups
4. Wire up `stores/chat.ts` to gateway push events
5. Streaming text with cursor indicator
6. Thinking block display (collapsible)
7. Rich prompt input with keyboard shortcuts

### Phase 5: File Browser (estimated: ~3 days)
1. Add `list_files` and `read_file` to gateway protocol
2. Implement server-side file operations with security guards
3. Build `FileBrowser.tsx` tree component
4. Build `FilePreview.tsx` with syntax highlighting
5. Wire up `stores/files.ts`

### Phase 6: Image/Artifact Viewing (estimated: ~2 days)
1. Add `list_artifacts` and `get_artifact` to gateway protocol
2. Wire through to `ArtifactRegistry`
3. Inline image rendering in chat messages
4. Build `ArtifactGallery.tsx` lightbox
5. Handle `artifact_added` push events in real-time

---

## Security Considerations

1. **Web tokens expire after 7 days** — limits blast radius of token theft
2. **Token encryption at rest** — Web Crypto AES-GCM in IndexedDB, not plaintext
3. **Path traversal prevention** — all file paths resolved + validated within workspace root
4. **File size limits** — 1 MB text, 5 MB images to prevent DoS via large file reads
5. **Rate limiting preserved** — existing auth rate limiting applies to web tokens too
6. **No token in URL** — maintained from current design (no query string tokens)
7. **CORS/Origin validation** — existing origin whitelist extended for the web-remote dev port
8. **CSP headers** — add Content-Security-Policy to gateway HTTP responses for the SPA
9. **`.gitignore` respect** — file browser skips ignored files/directories

## Dependencies to Add

| Package | Where | Purpose |
|---------|-------|---------|
| `qrcode` | `apps/desktop` | QR code SVG generation |
| `react-markdown` | `apps/web-remote` | Markdown rendering in chat |
| `rehype-highlight` | `apps/web-remote` | Code syntax highlighting in markdown |
| `highlight.js` | `apps/web-remote` | Syntax highlighting for file preview |
| `html5-qrcode` | `apps/web-remote` | QR code scanning from camera |
