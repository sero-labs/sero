# Google Integration

Sero's Google Workspace app provides Gmail and Google Calendar access
via [gogcli](https://github.com/steipete/gogcli), with native OAuth2
authentication handled entirely in Electron.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer (React)                                               │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐ │
│  │  AuthSetup    │  │  MailView     │  │  CalendarView        │ │
│  │  (sign-in UI) │  │  MailThread   │  │  MiniCalendar        │ │
│  │               │  │  (HTML email) │  │  EventDetail         │ │
│  └──────┬───────┘  └──────┬────────┘  └──────────┬───────────┘ │
│         │     useGoogleApi hook                   │             │
│         └──────────────┬──────────────────────────┘             │
│                        │ window.sero.google.*                   │
├────────────────────────┼────────────────────────────────────────┤
│  Preload (IPC bridge)  │                                        │
│  google.execute()      │  google.authStatus()                   │
│  google.login()        │  google.logout()                       │
│  google.onAuthEvent()  │                                        │
├────────────────────────┼────────────────────────────────────────┤
│  Main Process          │                                        │
│  ┌─────────────────────┴──────────────────────────────────────┐ │
│  │  google-api.ts (IPC handlers)                              │ │
│  │    ↓ auth         ↓ data                                   │ │
│  │  GoogleAuthManager    runGog() → execFile(gog --json ...)  │ │
│  │  (OAuth2 + PKCE)      --account auto-injected              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                        │                                        │
│                     gogcli                                       │
│                  (file keyring)                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Setup (One-Time)

### 1. Google Cloud OAuth Credentials

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. Create Credentials → **OAuth client ID** → **Desktop app**
3. Enable **Gmail API** and **Google Calendar API** in APIs & Services → Library
4. Under [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent), add yourself as a **Test user** (required while in "Testing" mode)
5. Add to `~/.sero-ui/agent/.env`:

```env
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-<your-secret>
```

### 2. Install gogcli

```bash
brew install steipete/tap/gogcli
# or download from https://github.com/steipete/gogcli/releases
```

If Homebrew fails (e.g. outdated Xcode CLT), download the binary manually
and place it in `~/.local/bin/gog`.

### 3. Restart Sero

The Google app auto-discovers via the `sero.app` manifest in
`packages/pi-google-extension/package.json`. No manual registration needed.

## Authentication

### OAuth2 Flow

The sign-in flow is handled by `GoogleAuthManager` in
`apps/desktop/electron/google/auth-manager.ts`:

1. User clicks **Sign in with Google** (no email input — Google's account
   chooser handles that)
2. Electron starts a loopback HTTP server on a random port
3. Opens the browser with Google's OAuth2 URL (Authorization Code + PKCE)
4. User picks their Google account and approves
5. Google redirects to `http://127.0.0.1:<port>` — the loopback server
   captures the authorization code
6. Electron exchanges the code for access + refresh tokens
7. Fetches the user's email via Google's userinfo API
8. Auto-imports OAuth client credentials + refresh token into gogcli

After sign-in, all gogcli commands work natively — the token is stored
in gogcli's file-based keyring.

### gogcli Configuration

The auth manager auto-configures gogcli on every sign-in:

- **Credentials**: piped to `gog auth credentials set -` (OAuth client JSON)
- **Token**: piped to `gog auth tokens import -` (`{email, refresh_token}`)
- **Keyring backend**: set to `file` (avoids macOS Keychain permission prompts)
- **`GOG_KEYRING_PASSWORD`**: set automatically in all gogcli process environments

### Auth Status Detection

On mount, the app checks `gog auth tokens list --json` for stored tokens.
If a token key like `token:default:user@gmail.com` exists, the user is
authenticated. The email is extracted from the key.

### Environment Variables

All credentials live in `~/.sero-ui/agent/.env`, loaded at startup by
`electron/env.ts`. The auth manager reads them lazily via functions
(not module-level constants) because env loading happens after module import.

## IPC Channels

| Channel | Direction | Purpose |
|---|---|---|
| `sero:google:execute` | renderer → main | Run `gog --json --no-input --account <email> <service> <args>` |
| `sero:google:authStatus` | renderer → main | Get `{configured, authenticated, email}` |
| `sero:google:login` | renderer → main | Start OAuth2 flow (opens browser) |
| `sero:google:logout` | renderer → main | Delete token from gogcli keyring |
| `sero:google:authEvent` | main → renderer | Auth progress events (`browser`, `waiting`, `success`, `error`) |

The `execute` channel auto-injects `--account <email>` from the cached
auth email, so the UI never needs to pass it.

## Gmail

### Data Flow

```
MailView → useGoogleApi.fetchInbox() → gog gmail search <query> --max 15
         → useGoogleApi.fetchThread() → gog gmail thread get <id>
         → gmail-parser.ts → parseGmailMessage()
```

### Gmail API Message Parsing

gogcli returns raw Gmail API format. The parser (`gmail-parser.ts`) handles:

- **Headers**: extracts Subject, From, To, Date from `payload.headers[]`
- **Body**: recursively finds `text/html` and `text/plain` parts in
  `payload.parts[]`, decodes base64url data via `atob()` + `TextDecoder`
  (critical for UTF-8 multi-byte characters like `'` and `…`)
- **Snippets**: decodes HTML entities (`&#39;` → `'`)

### HTML Email Rendering

`MailThread.tsx` renders HTML emails in a sandboxed iframe:

- `sandbox="allow-same-origin"` (no scripts)
- Dark theme CSS injected: light text on transparent background
- Single-message threads: iframe fills available space, content scrolls
  inside (header stays pinned)
- Multi-message threads: collapsible cards with auto-sizing iframes
- Images constrained to `max-width: 100%`

## Calendar

### Data Flow

```
CalendarView → useGoogleApi.fetchEvents('today'|'week')
             → gog calendar events primary --today|--week

MiniCalendar month change → useGoogleApi.fetchEventsRange(from, to)
                          → gog calendar events primary --from <date> --to <date> --max 50
```

### Components

- **MiniCalendar**: compact month grid with Monday start, today highlight,
  selected date highlight, event dots. Month navigation with ← → arrows.
  Clicking a day filters the event list.
- **CalendarView**: split layout — mini calendar sidebar (180px) + event
  list or detail panel. Today/This Week toggle. Date filter chip.
- **EventDetail**: rich event view matching Google Calendar:
  - Multi-day date ranges (corrects Google's exclusive end date)
  - Location as Google Maps link
  - Attendees with RSVP status icons (✓ accepted, ✕ declined, ? tentative)
  - Reminders (converts minutes to human-readable)
  - Source link for `fromGmail` events ("View confirmation")
  - Visibility indicator (🔒 "Only me" for private events)
  - Strips auto-generated Google boilerplate from descriptions
  - URLs in descriptions are clickable

### Event Fields

The fetcher captures all available fields from gogcli:

```typescript
interface CalendarEvent {
  id, calendarId, summary, start, end, location, description,
  attendees, isAllDay, status, htmlLink, visibility, eventType,
  sourceUrl, reminders, created, updated
}
```

## File Structure

```
packages/pi-google-extension/
├── package.json            # sero.app manifest (id: "google", port: 5186)
├── shared/types.ts         # GoogleAppState, GmailThread, GmailMessage, CalendarEvent
├── extension/
│   ├── index.ts            # Pi extension: gmail + gcal tools, TUI rendering
│   └── gogcli.ts           # runGog() / runGogJson() with PATH probing
├── ui/
│   ├── GoogleApp.tsx        # Root: tabbed Mail/Calendar, auth check, auto-fetch
│   ├── hooks/useGoogleApi.ts # IPC hook: auth, inbox, thread, events, calendars
│   ├── components/
│   │   ├── AuthSetup.tsx    # Sign-in button, status banners
│   │   ├── MailView.tsx     # Inbox list with search
│   │   ├── MailThread.tsx   # HTML email rendering (iframe)
│   │   ├── CalendarView.tsx # Mini cal + event list + detail
│   │   ├── MiniCalendar.tsx # Month grid with event dots
│   │   ├── EventDetail.tsx  # Rich event view
│   │   ├── gmail-parser.ts  # Gmail API message decoder
│   │   └── format-utils.ts  # Dates, names, event grouping
│   ├── styles.css
│   ├── index.html
│   └── tsconfig.json
└── vite.config.ts          # Module federation (port 5186)

apps/desktop/electron/
├── google/
│   └── auth-manager.ts     # GoogleAuthManager (OAuth2 + PKCE + gogcli import)
└── ipc/
    └── google-api.ts       # IPC handlers, gogcli execution, binary resolution
```

## Known Limitations

- **Rich Gmail event details** (hotel check-in/out, flight info, confirmation
  numbers) are not available via gogcli — Google parses these from email
  content using internal APIs that third-party tools can't access.
- **OAuth consent screen** must be in "Testing" mode with the user added as
  a test user, or the app must complete Google's verification process.
- **gogcli binary** must be installed separately — it's not bundled with Sero.
- **Single account only** — the current implementation tracks one Google
  account. Multi-account support would require UI for account switching.
