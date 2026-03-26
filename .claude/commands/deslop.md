# Deslop: Senior-Level Code Quality Analysis for TypeScript, React 19 & Electron 

## Table of Contents

1. [The Deslop Command](#the-deslop-command)
2. [TypeScript Principles](#typescript-principles)
   - [Type System Discipline](#type-system-discipline) — concrete types, branded types, discriminated unions
   - [Zod at the Boundary](#zod-at-the-boundary) — parse, don't validate
   - [No `any`, No `as` Casts](#no-any-no-as-casts) — escape hatches are bugs waiting to happen
   - [Barrel Exports & Module Boundaries](#barrel-exports--module-boundaries) — explicit public APIs
3. [React 19 Principles](#react-19-principles)
   - [Abolish useEffect](#abolish-useeffect) — the root of most React slop
   - [No Arbitrary setTimeout/setInterval](#no-arbitrary-settimeoutsetinterval) — timers are a design smell
   - [No Polling Mechanisms](#no-polling-mechanisms) — push, don't pull
   - [State Management with Zustand](#state-management-with-zustand) — kill prop drilling and context bloat
   - [Component Decomposition](#component-decomposition) — files under 250 lines, components under 150
   - [Colocation & Folder Structure](#colocation--folder-structure) — feature-first, not layer-first
   - [React 19 Patterns](#react-19-patterns) — use, Actions, Server Components awareness
4. [Electron Principles](#electron-principles)
   - [Process Boundary Discipline](#process-boundary-discipline) — main vs. renderer vs. preload
   - [IPC Type Safety](#ipc-type-safety) — typed channels, no stringly-typed messages
   - [Security Hardening](#security-hardening) — contextIsolation, no nodeIntegration
5. [Architecture Principles](#architecture-principles)
   - [File Size & Decomposition](#file-size--decomposition) — the 250-line rule
   - [Dependency Direction](#dependency-direction) — acyclic, leaf-ward
   - [Error Handling Strategy](#error-handling-strategy) — Result types, error boundaries, no silent catches
   - [Naming & Conventions](#naming--conventions) — predictable, greppable, boring
   - [Testing Strategy](#testing-strategy) — test behavior, not implementation
6. [Universal Clean Code Principles](#universal-clean-code-principles) — KISS, YAGNI, DRY, guard clauses, cognitive load
7. [When to Relax Rules](#when-to-relax-rules) — context over dogma
8. [References](#references)

---

## The Deslop Command

[↑ top](#table-of-contents)

You are a **senior-level** code quality analyzer for TypeScript, React 19, and Electron codebases. Your task is to identify "slop" — code that a senior engineer or architect would flag in review — and suggest concrete, opinionated improvements.

You are not a linter. You catch **structural, design, and architectural** issues. You think about maintainability at scale, team onboarding cost, and long-term velocity.

At the end, figure out what you should actually change in the code and ask the user if you should make the changes. Then make the changes if the user affirms.

### Target

Analyze: $ARGUMENTS

If no argument provided, operate on the current folder or current code base.

### Process

1. **Read all principles** from this document to calibrate your quality bar
2. **Read the target file(s)** using the Read tool
3. **Reread relevant principles** based on what violations you observe
4. **Identify violations** organized by principle, with severity
5. **Suggest concrete fixes** with before/after TypeScript/React examples

### Output Format

#### Summary

Brief overview of code health (1-2 sentences). Call out the single biggest structural problem.

#### Violations Found

For each violation:

```
##### [Principle Name] — [Specific Issue]

**Location**: `src/renderer/components/TradePanel.tsx:45-82`

**Severity**: P0/P1/P2/P3

**Problem**: [Description of what's wrong and why it matters]

**Before**:
```tsx
// problematic code
```

**After**:
```tsx
// improved code
```

**Why**: [Brief explanation referencing the principle — why a senior engineer would flag this]
```

#### Recommendations

Prioritized list of changes, most impactful first. Group related changes that should be done together.

Then, ask the user if they'd like to implement some or all of the changes.

If they affirm, implement them. When implementing, consider if some changes could be done in parallel with async agents for efficiency.

### Important Notes

- **Opinionated, not dogmatic**: This command has strong opinions (e.g., "remove useEffect") but acknowledges exceptions. Always explain *why*.
- **Architecture-level thinking**: Don't just fix syntax — question structure, module boundaries, data flow.
- **Refactoring scope**: Suggest file splits, module extractions, and folder reorganization — not just inline fixes.
- **Don't over-engineer**: Suggesting abstractions for single-use code violates YAGNI/KISS.
- **Rule of Three**: Don't suggest abstracting until pattern proven with 3+ occurrences.
- **Be specific**: Reference exact file paths and line numbers. Provide concrete before/after code.

### Priority Matrix

| Priority | Type | Examples | Fix When |
|----------|------|----------|----------|
| **P0: Critical** | Security, data loss, crashes | `nodeIntegration: true`, unvalidated IPC, `any` in data paths, missing error boundaries | Immediately |
| **P1: High** | Bugs waiting to happen | useEffect data fetching, stale closures, missing cleanup, untyped IPC channels, silent error swallowing | This PR |
| **P2: Medium** | Maintainability & velocity | Files >250 lines, prop drilling >2 levels, duplicate type definitions, layer-first folders, polling mechanisms | When touching file |
| **P3: Low** | Polish & conventions | Inconsistent naming, missing `as const`, unused exports, minor DRY violations | Boy Scout Rule |

**Effort modifiers:**
- **Quick win** (< 5 min): Bump up one priority level
- **Risky change** (no tests): Bump down one level, suggest adding tests first
- **Requires coordination**: Note in recommendations, may need team discussion

---

# TypeScript Principles

[↑ top](#table-of-contents)

> *TypeScript's type system is your first line of defense. Use it aggressively. If the compiler can't catch it, your users will.*

---

## Type System Discipline

[↑ top](#table-of-contents)

> "Make illegal states unrepresentable."
> — Yaron Minsky

### Core Concept

**Use the type system to encode business rules.** Every `string` that represents something specific (an ID, a status, a currency code) should be a distinct type. Every union should be discriminated. Every object shape should be defined once.

### Concrete Types Over Primitives

```tsx
// ❌ Wrong — Primitive obsession
function processOrder(orderId: string, status: string, amount: number): void

// ✅ Correct — Domain types encode constraints
type OrderId = string & { readonly __brand: 'OrderId' }
type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected'
type Currency = 'USD' | 'EUR' | 'GBP'

interface Money {
  readonly amount: number
  readonly currency: Currency
}

function processOrder(orderId: OrderId, status: OrderStatus, amount: Money): void
```

### Discriminated Unions Over Optional Fields

```tsx
// ❌ Wrong — Optional fields allow illegal states
interface Trade {
  status: string
  filledAt?: Date       // Can be set when status is 'pending'
  rejectionReason?: string  // Can be set when status is 'filled'
  fillPrice?: number    // Can be missing when status is 'filled'
}

// ✅ Correct — Each state is its own shape
type Trade =
  | { status: 'pending'; submittedAt: Date }
  | { status: 'filled'; filledAt: Date; fillPrice: number }
  | { status: 'cancelled'; cancelledAt: Date }
  | { status: 'rejected'; rejectedAt: Date; rejectionReason: string }

// Compiler enforces: accessing fillPrice requires narrowing to 'filled'
function getFillPrice(trade: Trade): number | null {
  if (trade.status === 'filled') {
    return trade.fillPrice // ✅ TypeScript knows this exists
  }
  return null
}
```

### No Duplicate Type Definitions

```tsx
// ❌ Wrong — Same shape defined in three places
// types/order.ts
interface Order { id: string; symbol: string; quantity: number }

// components/OrderForm.tsx
interface OrderFormData { id: string; symbol: string; quantity: number }

// api/orders.ts
interface OrderPayload { id: string; symbol: string; quantity: number }

// ✅ Correct — Single source of truth, derive what you need
// types/order.ts
export interface Order {
  readonly id: OrderId
  readonly symbol: string
  readonly quantity: number
  readonly side: 'buy' | 'sell'
  readonly status: OrderStatus
}

// Derive, don't duplicate
export type CreateOrderInput = Omit<Order, 'id' | 'status'>
export type OrderSummary = Pick<Order, 'id' | 'symbol' | 'status'>
```

### `satisfies` Over `as`

```tsx
// ❌ Wrong — `as` lies to the compiler
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
} as Config // No validation — could be missing fields

// ✅ Correct — `satisfies` validates without widening
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
} satisfies Config // Compile error if shape doesn't match
```

### `as const` for Literal Types

```tsx
// ❌ Wrong — Widened to string[]
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP']
// type: string[] — useless for type narrowing

// ✅ Correct — Preserved as tuple of literals
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP'] as const
// type: readonly ['USD', 'EUR', 'GBP']
type Currency = typeof SUPPORTED_CURRENCIES[number] // 'USD' | 'EUR' | 'GBP'
```

### Common Violations

| Smell | Fix |
|-------|-----|
| `any` anywhere | Use `unknown` + type guard, or define the actual type |
| `as` type assertions | Use `satisfies`, type guards, or fix the actual type |
| `string` for IDs, statuses, codes | Branded types or string literal unions |
| Same interface in multiple files | Single definition in `types/`, derive with `Pick`/`Omit` |
| `interface Foo { [key: string]: any }` | Use `Record<Key, Value>` with concrete types |
| Optional fields for mutually exclusive states | Discriminated unions |
| `enum` | `as const` objects or string literal unions (enums have runtime quirks) |

### Summary

1. **Branded types for domain primitives** — `OrderId`, `UserId`, not raw `string`
2. **Discriminated unions for state machines** — make illegal states unrepresentable
3. **Single source of truth for types** — define once, derive with utility types
4. **`satisfies` over `as`** — validate, don't lie
5. **`as const` for literal collections** — preserve narrow types
6. **Never `enum`** — use `as const` objects or string literal unions

---

## Zod at the Boundary

[↑ top](#table-of-contents)

> "Parse, don't validate."
> — Alexis King

### Core Concept

**Validate all external data at system boundaries using Zod, then trust the types internally.** IPC messages, API responses, file reads, user input — anything crossing a trust boundary gets parsed through a Zod schema. Internal function signatures use the inferred types and never re-validate.

### The Pattern

```tsx
import { z } from 'zod'

// 1. Define the schema (single source of truth)
const TradeSchema = z.object({
  id: z.string().brand('TradeId'),
  symbol: z.string().min(1).max(10),
  side: z.enum(['buy', 'sell']),
  quantity: z.number().positive().int(),
  price: z.number().positive(),
  timestamp: z.string().datetime(),
})

// 2. Derive the type (never define separately!)
type Trade = z.infer<typeof TradeSchema>

// 3. Parse at the boundary
function handleTradeMessage(raw: unknown): Trade {
  return TradeSchema.parse(raw) // Throws ZodError with details
}

// 4. Internal functions trust the type — no re-validation
function calculateNotional(trade: Trade): number {
  return trade.quantity * trade.price // Types guarantee these exist and are positive
}
```

### Where to Parse

| Boundary | Example |
|----------|---------|
| **IPC messages** | `ipcRenderer.on('trade-update', (_, raw) => TradeSchema.parse(raw))` |
| **API responses** | `const data = ResponseSchema.parse(await res.json())` |
| **File reads** | `const config = ConfigSchema.parse(JSON.parse(contents))` |
| **User input** | `const form = FormSchema.safeParse(formData)` |
| **URL params** | `const params = ParamsSchema.parse(searchParams)` |
| **WebSocket messages** | `const msg = MessageSchema.parse(JSON.parse(event.data))` |
| **Electron store reads** | `const settings = SettingsSchema.parse(store.get('settings'))` |

### Anti-Patterns

```tsx
// ❌ Wrong — Manual validation scattered everywhere
function processOrder(data: any) {
  if (!data.id || typeof data.id !== 'string') throw new Error('Invalid id')
  if (!data.quantity || data.quantity < 0) throw new Error('Invalid quantity')
  // ... 20 more lines of this
}

// ❌ Wrong — Type assertion without validation
const trade = ipcData as Trade // No runtime check!

// ❌ Wrong — Defining type AND schema separately
interface Trade { id: string; symbol: string }
const TradeSchema = z.object({ id: z.string(), symbol: z.string() })
// These will drift apart

// ✅ Correct — Schema is the single source of truth
const TradeSchema = z.object({ id: z.string(), symbol: z.string() })
type Trade = z.infer<typeof TradeSchema>
```

### Summary

1. **Zod schema is the single source of truth** — infer types from schemas, never duplicate
2. **Parse at every trust boundary** — IPC, API, file I/O, user input
3. **Trust types internally** — no re-validation past the boundary
4. **`safeParse` for user input** — return errors, don't throw
5. **`parse` for system boundaries** — fail fast on corrupt data

---

## No `any`, No `as` Casts

[↑ top](#table-of-contents)

### Core Concept

**`any` disables the type system. `as` lies to it.** Both are escape hatches that create invisible bugs. In a well-typed codebase, neither should appear outside of type definition files or truly exceptional cases.

### Eliminating `any`

```tsx
// ❌ Wrong — any propagates like a virus
function processEvent(event: any) {
  return event.data.trades.map((t: any) => t.price * t.quantity)
}

// ✅ Correct — unknown forces you to narrow
function processEvent(event: unknown): number[] {
  const parsed = TradeEventSchema.parse(event)
  return parsed.data.trades.map(t => t.price * t.quantity)
}
```

### Eliminating `as`

```tsx
// ❌ Wrong — as hides a potential null
const element = document.getElementById('root') as HTMLElement

// ✅ Correct — handle the null case
const element = document.getElementById('root')
if (!element) throw new Error('Root element not found')
// element is now HTMLElement (narrowed by control flow)

// ❌ Wrong — as hides shape mismatch
const config = JSON.parse(raw) as AppConfig

// ✅ Correct — validate the shape
const config = AppConfigSchema.parse(JSON.parse(raw))
```

### Acceptable Uses

| `any`/`as` Use | Why It's OK |
|----------------|-------------|
| Type definition files (`*.d.ts`) | Bridging untyped libraries |
| `as const` | Not a type assertion — narrows to literal |
| `as unknown as T` in test mocks | Test utilities, clearly marked |
| Generic constraint workarounds | Sometimes TypeScript needs help — add a comment explaining why |

### Summary

1. **`any` is a virus** — it silently disables checking on everything it touches
2. **`unknown` is the safe alternative** — forces explicit narrowing
3. **`as` lies to the compiler** — use type guards, `satisfies`, or Zod instead
4. **Grep your codebase for both** — treat every occurrence as tech debt

---

## Barrel Exports & Module Boundaries

[↑ top](#table-of-contents)

### Core Concept

**Every feature folder should have an explicit public API via an `index.ts` barrel.** Internal modules import freely within the feature. External modules import only from the barrel. This creates clear module boundaries and makes refactoring safe.

```
src/renderer/features/order-book/
├── index.ts              ← Public API (barrel)
├── OrderBook.tsx          ← Internal component
├── OrderBookRow.tsx       ← Internal component
├── useOrderBookData.ts    ← Internal hook
├── order-book.store.ts    ← Internal store
├── order-book.types.ts    ← Internal types
└── __tests__/
    └── OrderBook.test.tsx
```

```tsx
// index.ts — Explicit public API
export { OrderBook } from './OrderBook'
export type { OrderBookEntry } from './order-book.types'
// Everything else is internal implementation
```

### Anti-Patterns

```tsx
// ❌ Wrong — Reaching into a feature's internals
import { useOrderBookData } from '@/features/order-book/useOrderBookData'

// ✅ Correct — Import from the barrel
import { OrderBook } from '@/features/order-book'
```

---

# React 19 Principles

[↑ top](#table-of-contents)

> *React 19 gives us the tools to eliminate entire categories of slop. useEffect for data fetching is dead. Prop drilling through context is dead. Polling is dead. Use the right primitives.*

---

## Abolish useEffect

[↑ top](#table-of-contents)

> "useEffect is the dumpster fire of React. Most uses are wrong."
> — (paraphrased from the React team's own documentation)

### Core Concept

**`useEffect` is almost never the right tool.** It's a synchronization primitive for genuinely external systems (DOM APIs, WebSocket connections, third-party libraries). It is NOT for data fetching, derived state, event handling, or "doing something when X changes." Every `useEffect` in your codebase should be individually justified.

### The Replacement Matrix

| What You're Doing | ❌ Wrong (useEffect) | ✅ Correct Replacement |
|--------------------|----------------------|------------------------|
| **Fetching data** | `useEffect(() => { fetch(...) }, [])` | `use(promise)` / TanStack Query / Zustand async actions |
| **Derived state** | `useEffect(() => { setFullName(first + last) }, [first, last])` | `const fullName = first + ' ' + last` (just compute it) |
| **Responding to prop changes** | `useEffect(() => { reset() }, [userId])` | Use a `key` prop to remount: `<Profile key={userId} />` |
| **Event side effects** | `useEffect(() => { if (submitted) save() }, [submitted])` | Call `save()` in the event handler directly |
| **Subscribing to external store** | `useEffect(() => { const sub = store.subscribe(...) }, [])` | `useSyncExternalStore` or Zustand's `useStore` |
| **Initializing once** | `useEffect(() => { init() }, [])` | Module-level initialization or lazy `useRef` |
| **Timers** | `useEffect(() => { const id = setInterval(...) }, [])` | See [No Arbitrary setTimeout/setInterval](#no-arbitrary-settimeoutsetinterval) |

### Common Violations

```tsx
// ❌ Wrong — useEffect for derived state (the #1 most common mistake)
const [items, setItems] = useState<Item[]>([])
const [filteredItems, setFilteredItems] = useState<Item[]>([])

useEffect(() => {
  setFilteredItems(items.filter(i => i.status === 'active'))
}, [items])

// ✅ Correct — Just compute it. It's a pure transformation.
const [items, setItems] = useState<Item[]>([])
const filteredItems = useMemo(
  () => items.filter(i => i.status === 'active'),
  [items]
)
// Or if the filter is cheap (it usually is), skip useMemo entirely:
const filteredItems = items.filter(i => i.status === 'active')
```

```tsx
// ❌ Wrong — useEffect for data fetching
const [trades, setTrades] = useState<Trade[]>([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState<Error | null>(null)

useEffect(() => {
  let cancelled = false
  setLoading(true)
  fetchTrades()
    .then(data => { if (!cancelled) setTrades(data) })
    .catch(err => { if (!cancelled) setError(err) })
    .finally(() => { if (!cancelled) setLoading(false) })
  return () => { cancelled = true }
}, [])

// ✅ Correct — Zustand store with async action
// stores/trades.store.ts
interface TradesStore {
  trades: Trade[]
  status: 'idle' | 'loading' | 'error'
  error: Error | null
  fetchTrades: () => Promise<void>
}

export const useTradesStore = create<TradesStore>((set) => ({
  trades: [],
  status: 'idle',
  error: null,
  fetchTrades: async () => {
    set({ status: 'loading', error: null })
    try {
      const trades = await api.getTrades()
      set({ trades, status: 'idle' })
    } catch (error) {
      set({ error: error as Error, status: 'error' })
    }
  },
}))

// Component is now trivial
function TradeList() {
  const { trades, status, fetchTrades } = useTradesStore()
  // Fetch on mount via the store, or trigger from a user action
}
```

```tsx
// ❌ Wrong — useEffect to sync prop to state (unnecessary state)
function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    loadUser(userId).then(setUser)
  }, [userId])

  // ...
}

// ✅ Correct — Key-based remounting
function UserProfile({ userId }: { userId: string }) {
  // Data fetching handled by store or React 19 `use()`
}

// Parent:
<UserProfile key={userId} userId={userId} />
```

### When useEffect IS Correct

The following are **legitimate** uses. Each connects React to something genuinely external:

```tsx
// ✅ Correct — DOM measurement (genuine external system)
useEffect(() => {
  const { height } = ref.current.getBoundingClientRect()
  setHeight(height)
}, [])

// ✅ Correct — Third-party library integration
useEffect(() => {
  const chart = new Chart(canvasRef.current, config)
  return () => chart.destroy()
}, [config])

// ✅ Correct — WebSocket connection lifecycle
useEffect(() => {
  const ws = new WebSocket(url)
  ws.onmessage = handleMessage
  return () => ws.close()
}, [url])

// ✅ Correct — Browser event listener not handled by React
useEffect(() => {
  const handler = () => setOnline(navigator.onLine)
  window.addEventListener('online', handler)
  window.addEventListener('offline', handler)
  return () => {
    window.removeEventListener('online', handler)
    window.removeEventListener('offline', handler)
  }
}, [])
```

### The Audit Question

For every `useEffect` in your codebase, ask: **"What external system is this synchronizing with?"** If you can't name a specific external system (DOM API, WebSocket, third-party library, browser API), the `useEffect` is wrong.

### Summary

1. **useEffect is not for data fetching** — use Zustand async actions, TanStack Query, or React 19 `use()`
2. **useEffect is not for derived state** — just compute it, optionally with `useMemo`
3. **useEffect is not for event responses** — handle it in the event handler
4. **useEffect IS for external system sync** — DOM, WebSockets, third-party libs, browser APIs
5. **Audit every useEffect** — "What external system am I syncing with?"

---

## No Arbitrary setTimeout/setInterval

[↑ top](#table-of-contents)

> "Every setTimeout is a race condition waiting to happen."

### Core Concept

**Arbitrary timers are a code smell.** They indicate missing reactivity, hacked-together sequencing, or cargo-culted "fixes" for timing bugs. Every `setTimeout` and `setInterval` should be individually justified, and most can be eliminated.

### The Replacement Matrix

| What You're Doing | ❌ Wrong | ✅ Correct |
|--------------------|----------|------------|
| **Waiting for DOM update** | `setTimeout(() => measure(), 0)` | `useLayoutEffect` or `requestAnimationFrame` |
| **Debouncing input** | Hand-rolled `setTimeout` | `useDeferredValue` (React 19) or a proper debounce utility |
| **Retrying failed requests** | `setTimeout(() => retry(), 3000)` | Exponential backoff utility with abort support |
| **Polling for updates** | `setInterval(() => fetch(), 5000)` | See [No Polling Mechanisms](#no-polling-mechanisms) |
| **"Fixing" a race condition** | `setTimeout(() => setState(x), 100)` | Fix the actual race condition. The delay is arbitrary and fragile. |
| **Animations** | `setInterval(() => frame(), 16)` | `requestAnimationFrame` or CSS transitions |
| **Delaying for UX** | `setTimeout(() => hideToast(), 3000)` | ✅ This one is actually fine — genuine UX timing |

### Common Violations

```tsx
// ❌ Wrong — setTimeout to "fix" a render timing issue
useEffect(() => {
  setTimeout(() => {
    gridApi.refreshCells()
  }, 100) // Magic number. Why 100ms? Will it always be enough?
}, [data])

// ✅ Correct — React to the actual state change
useEffect(() => {
  if (gridApi && data) {
    gridApi.refreshCells()
  }
}, [gridApi, data])

// Or if you genuinely need to wait for a layout paint:
useLayoutEffect(() => {
  gridApi.refreshCells()
}, [data])
```

```tsx
// ❌ Wrong — setInterval for polling
useEffect(() => {
  const id = setInterval(async () => {
    const data = await fetchPositions()
    setPositions(data)
  }, 5000)
  return () => clearInterval(id)
}, [])

// ✅ Correct — Push-based via SignalR/WebSocket (see No Polling)
```

### Acceptable Uses

| Timer Use | Why It's OK |
|-----------|-------------|
| **UX delays** (toast auto-dismiss, animation timing) | Genuine user-facing timing |
| **Exponential backoff** (with proper abort/cleanup) | Structured retry logic, not arbitrary |
| **Rate limiting** (throttle/debounce utilities) | Controlled, tested utilities |

### Summary

1. **Every timer needs justification** — "Why this duration? What breaks if it's shorter/longer?"
2. **Magic delay numbers are bugs** — `setTimeout(fn, 100)` is never correct for fixing timing
3. **Use the platform** — `requestAnimationFrame`, `useLayoutEffect`, `useDeferredValue`
4. **UX timing is legitimate** — toast durations, animation delays are fine

---

## No Polling Mechanisms

[↑ top](#table-of-contents)

### Core Concept

**Push, don't pull.** In an Electron app with full control over the networking stack, polling is always the wrong answer. You have access to WebSockets, SignalR, Server-Sent Events, and Electron IPC — all of which support push-based updates.

### The Replacement Matrix

| Data Source | ❌ Polling | ✅ Push-Based |
|-------------|-----------|---------------|
| **Backend API** | `setInterval(() => fetch('/trades'), 1000)` | WebSocket / SignalR subscription |
| **Main process data** | `setInterval(() => ipcRenderer.invoke('get-status'), 500)` | Main process sends via `webContents.send()` when data changes |
| **File system** | `setInterval(() => readFile(path), 2000)` | `fs.watch()` / `chokidar` |
| **Database** | `setInterval(() => query(), 5000)` | Database change notifications / triggers |
| **System state** | `setInterval(() => checkNetwork(), 3000)` | `navigator.onLine` + event listeners |

### Anti-Patterns

```tsx
// ❌ Wrong — Polling from renderer to main
useEffect(() => {
  const id = setInterval(async () => {
    const status = await window.electronAPI.getConnectionStatus()
    setConnectionStatus(status)
  }, 1000)
  return () => clearInterval(id)
}, [])

// ✅ Correct — Main process pushes updates
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  onConnectionStatus: (callback: (status: ConnectionStatus) => void) => {
    const handler = (_: IpcRendererEvent, status: ConnectionStatus) => callback(status)
    ipcRenderer.on('connection-status', handler)
    return () => ipcRenderer.removeListener('connection-status', handler)
  },
})

// main.ts — Push when state actually changes
connectionManager.on('statusChange', (status) => {
  mainWindow.webContents.send('connection-status', status)
})

// Component — Subscribe, don't poll
useEffect(() => {
  const unsub = window.electronAPI.onConnectionStatus(setConnectionStatus)
  return unsub
}, [])
```

### Summary

1. **Polling is never necessary in Electron** — you control both ends
2. **Use IPC push** — main process sends when data changes
3. **Use WebSocket/SignalR** — for backend real-time data
4. **Use file watchers** — for filesystem changes
5. **Every setInterval with a fetch inside is wrong** — replace with subscription

---

## State Management with Zustand

[↑ top](#table-of-contents)

> "The best state management is the least state management."

### Core Concept

**Zustand replaces most uses of Context, useReducer, and prop drilling.** It's lightweight, TypeScript-native, works outside React (useful in Electron main process bridges), and eliminates the re-render cascades caused by Context. It's the recommended state management for this stack.

### When to Use What

| State Type | Tool |
|------------|------|
| **UI-local state** (open/closed, input value) | `useState` |
| **Derived values** | Compute inline or `useMemo` |
| **Shared application state** (user, trades, settings) | Zustand store |
| **Server state** (cached API responses) | TanStack Query or Zustand |
| **URL state** (current route, search params) | Router |
| **Form state** | React Hook Form or controlled inputs |

### Store Design Principles

```tsx
// ❌ Wrong — One giant store for everything
const useStore = create<{
  user: User | null
  trades: Trade[]
  settings: Settings
  notifications: Notification[]
  isTradeDialogOpen: boolean
  selectedTradeId: string | null
  // ... 40 more fields
}>((set) => ({ /* ... */ }))

// ✅ Correct — Separate stores by domain
// stores/user.store.ts
export const useUserStore = create<UserStore>((set) => ({
  user: null,
  login: async (credentials) => { /* ... */ },
  logout: () => set({ user: null }),
}))

// stores/trades.store.ts
export const useTradesStore = create<TradesStore>((set, get) => ({
  trades: [],
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  getSelected: () => get().trades.find(t => t.id === get().selectedId),
}))
```

### Zustand Slices for Complex Domains

```tsx
// For stores that naturally group but share access:
interface TradeSlice {
  trades: Trade[]
  addTrade: (trade: Trade) => void
}

interface FilterSlice {
  filters: TradeFilters
  setFilter: (key: keyof TradeFilters, value: unknown) => void
  filteredTrades: () => Trade[]
}

export const useTradeStore = create<TradeSlice & FilterSlice>()((...args) => ({
  ...createTradeSlice(...args),
  ...createFilterSlice(...args),
}))
```

### Anti-Patterns

```tsx
// ❌ Wrong — Context for frequently updating data (causes re-render cascade)
const TradeContext = createContext<Trade[]>([])

function TradeProvider({ children }: { children: React.ReactNode }) {
  const [trades, setTrades] = useState<Trade[]>([])
  // Every child re-renders when ANY trade changes
  return <TradeContext.Provider value={trades}>{children}</TradeContext.Provider>
}

// ❌ Wrong — Prop drilling through 3+ levels
<App trades={trades}>
  <Dashboard trades={trades}>
    <TradePanel trades={trades}>
      <TradeRow trade={trades[0]} />  // 4 levels deep!

// ❌ Wrong — useReducer for async operations
const [state, dispatch] = useReducer(tradeReducer, initialState)
useEffect(() => {
  dispatch({ type: 'FETCH_START' })
  fetchTrades()
    .then(trades => dispatch({ type: 'FETCH_SUCCESS', trades }))
    .catch(error => dispatch({ type: 'FETCH_ERROR', error }))
}, [])
// This is 30 lines that Zustand does in 10
```

### Summary

1. **Zustand for shared state** — replaces Context, useReducer, and prop drilling
2. **Separate stores by domain** — user, trades, settings, UI
3. **No Context for frequently-updating data** — it causes re-render cascades
4. **No prop drilling past 2 levels** — if you're passing props through a component that doesn't use them, use a store
5. **Async actions live in the store** — not in useEffect + useReducer

---

## Component Decomposition

[↑ top](#table-of-contents)

### Core Concept

**No component file should exceed 250 lines. No single component should exceed 150 lines.** Large components are the #1 source of React bugs: stale closures, unnecessary re-renders, tangled state, and impossible-to-test logic.

### Size Targets

| Element | Target | Smell | Hard Limit |
|---------|--------|-------|------------|
| **Component** | < 80 lines | > 120 lines | 150 lines |
| **Component file** | < 150 lines | > 200 lines | 250 lines |
| **Custom hook** | < 50 lines | > 80 lines | 100 lines |
| **Store file** | < 80 lines | > 120 lines | 150 lines |
| **Utility file** | < 100 lines | > 150 lines | 200 lines |

### Decomposition Strategies

```tsx
// ❌ Wrong — 400-line component with everything inline
function TradingDashboard() {
  // 30 lines of state declarations
  // 50 lines of useEffect hooks
  // 40 lines of event handlers
  // 20 lines of computed values
  // 260 lines of JSX with inline conditions
}

// ✅ Correct — Decomposed by responsibility
// TradingDashboard.tsx (orchestrator — ~40 lines)
function TradingDashboard() {
  return (
    <DashboardLayout>
      <TradeFilters />
      <TradeGrid />
      <OrderEntry />
      <PositionSummary />
    </DashboardLayout>
  )
}

// TradeGrid.tsx (~80 lines — uses store directly)
function TradeGrid() {
  const { filteredTrades } = useTradesStore()
  // Rendering logic only
}
```

### Extract Hooks for Reusable Logic

```tsx
// ❌ Wrong — Business logic in component
function OrderForm() {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.symbol) errs.symbol = 'Required'
    if (form.quantity <= 0) errs.quantity = 'Must be positive'
    if (form.quantity > maxPosition) errs.quantity = `Max ${maxPosition}`
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    await api.submitOrder(form)
  }
  // ... JSX
}

// ✅ Correct — Logic in custom hook
// useOrderForm.ts
function useOrderForm() {
  const [form, setForm] = useState(initialForm)
  const errors = useMemo(() => validateOrder(form), [form])
  const isValid = Object.keys(errors).length === 0

  const submit = async () => {
    if (!isValid) return
    await api.submitOrder(form)
  }

  return { form, setForm, errors, isValid, submit }
}

// OrderForm.tsx — Pure presentation
function OrderForm() {
  const { form, setForm, errors, isValid, submit } = useOrderForm()
  // JSX only, no logic
}
```

### Summary

1. **250-line hard limit per file** — split before you reach it
2. **Components do rendering, hooks do logic** — separate concerns
3. **Orchestrator components** — thin parents that compose children
4. **No inline business logic in JSX** — extract to hooks or utilities

---

## Colocation & Folder Structure

[↑ top](#table-of-contents)

### Core Concept

**Feature-first, not layer-first.** Group files by what they do, not what they are. A developer working on "order entry" should find everything they need in one folder — not hunt across `components/`, `hooks/`, `types/`, `utils/`, `stores/`, and `styles/`.

### Recommended Structure

```
src/
├── main/                          # Electron main process
│   ├── main.ts                    # Entry point
│   ├── windows/                   # Window management
│   ├── ipc/                       # IPC handlers (organized by domain)
│   │   ├── trades.ipc.ts
│   │   └── settings.ipc.ts
│   └── services/                  # Main-process services
│       ├── database.service.ts
│       └── connection.service.ts
│
├── preload/                       # Preload scripts
│   ├── preload.ts
│   └── api.ts                     # Typed API exposed to renderer
│
├── renderer/                      # React application
│   ├── app/                       # App shell
│   │   ├── App.tsx
│   │   ├── AppProviders.tsx
│   │   └── routes.tsx
│   │
│   ├── features/                  # Feature modules (the core)
│   │   ├── trade-blotter/
│   │   │   ├── index.ts           # Public barrel
│   │   │   ├── TradeBlotter.tsx
│   │   │   ├── TradeRow.tsx
│   │   │   ├── trade-blotter.store.ts
│   │   │   ├── trade-blotter.types.ts
│   │   │   └── __tests__/
│   │   │
│   │   ├── order-entry/
│   │   │   ├── index.ts
│   │   │   ├── OrderEntryForm.tsx
│   │   │   ├── useOrderValidation.ts
│   │   │   ├── order-entry.store.ts
│   │   │   └── __tests__/
│   │   │
│   │   └── position-manager/
│   │       ├── index.ts
│   │       ├── PositionGrid.tsx
│   │       └── position.store.ts
│   │
│   ├── shared/                    # Truly shared utilities
│   │   ├── components/            # Generic UI components (Button, Modal, etc.)
│   │   ├── hooks/                 # Generic hooks (useDebounce, useMediaQuery)
│   │   ├── utils/                 # Pure utility functions
│   │   └── types/                 # Cross-feature types
│   │
│   └── styles/                    # Global styles and theme
│
├── shared/                        # Code shared between main and renderer
│   ├── ipc-channels.ts            # IPC channel names and types
│   └── types/                     # Shared domain types
│
└── __tests__/                     # Integration / E2E tests
```

### Anti-Patterns

```
// ❌ Wrong — Layer-first (everything is far from everything else)
src/
├── components/
│   ├── TradeBlotter.tsx
│   ├── OrderEntry.tsx
│   ├── PositionGrid.tsx
│   └── Button.tsx           // Generic mixed with feature-specific
├── hooks/
│   ├── useTradeData.ts
│   ├── useOrderValidation.ts
│   └── useDebounce.ts       // Generic mixed with feature-specific
├── stores/
│   ├── tradeStore.ts
│   └── orderStore.ts
├── types/
│   ├── trade.ts
│   └── order.ts
└── utils/
    ├── formatCurrency.ts
    └── validateOrder.ts
```

### The Colocation Test

**"If I need to modify the order entry feature, how many directories do I need to touch?"** If the answer is more than 2 (the feature folder + maybe shared), your structure is wrong.

### Summary

1. **Feature-first folders** — group by domain, not by file type
2. **Barrel exports** — explicit public API per feature
3. **`shared/` for genuinely shared code** — generic components, hooks, utils
4. **`shared/` at root for cross-process types** — IPC channels, domain types
5. **Tests colocated** — `__tests__/` inside feature folders

---

## React 19 Patterns

[↑ top](#table-of-contents)

### Core Concept

React 19 introduces primitives that eliminate boilerplate and entire categories of bugs. Use them.

### `use()` for Promises

```tsx
// React 19 — use() unwraps promises in render
import { use, Suspense } from 'react'

function TradeDetails({ tradePromise }: { tradePromise: Promise<Trade> }) {
  const trade = use(tradePromise) // Suspends until resolved
  return <div>{trade.symbol}: {trade.quantity}</div>
}

// Usage with Suspense boundary
<Suspense fallback={<Skeleton />}>
  <TradeDetails tradePromise={fetchTrade(id)} />
</Suspense>
```

### Actions & `useActionState`

```tsx
// React 19 — useActionState for form submissions
import { useActionState } from 'react'

function OrderForm() {
  const [state, submitAction, isPending] = useActionState(
    async (prevState: FormState, formData: FormData) => {
      const result = OrderSchema.safeParse(Object.fromEntries(formData))
      if (!result.success) return { errors: result.error.flatten() }
      await api.submitOrder(result.data)
      return { errors: null, success: true }
    },
    { errors: null }
  )

  return (
    <form action={submitAction}>
      <input name="symbol" />
      {state.errors?.fieldErrors.symbol && <span>{state.errors.fieldErrors.symbol}</span>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  )
}
```

### `useOptimistic` for Instant UI

```tsx
import { useOptimistic } from 'react'

function TradeList({ trades }: { trades: Trade[] }) {
  const [optimisticTrades, addOptimistic] = useOptimistic(
    trades,
    (current, newTrade: Trade) => [...current, newTrade]
  )

  async function submitTrade(trade: Trade) {
    addOptimistic(trade) // Instant UI update
    await api.submitTrade(trade) // Actual submission
  }

  return optimisticTrades.map(t => <TradeRow key={t.id} trade={t} />)
}
```

### Summary

1. **`use()` for async data in components** — replaces useEffect + useState + loading state
2. **`useActionState` for forms** — replaces manual form state management
3. **`useOptimistic` for instant feedback** — replaces manual optimistic update patterns
4. **Suspense boundaries everywhere** — define loading states declaratively

---

# Electron Principles

[↑ top](#table-of-contents)

> *Electron gives you power. With that power comes responsibility. The process boundary is sacred. IPC is your API layer — treat it like one.*

---

## Process Boundary Discipline

[↑ top](#table-of-contents)

### Core Concept

**Main process = backend. Renderer process = frontend. Preload = API layer.** Never blur these boundaries. The main process handles system access, the renderer handles UI, and the preload script is the typed contract between them.

### What Lives Where

| Process | Responsibilities | Never Do |
|---------|-----------------|----------|
| **Main** | File I/O, database, native APIs, window management, system tray, menus | DOM manipulation, React rendering |
| **Renderer** | UI rendering, user interaction, visual state | File system access, native APIs, `require('electron')` |
| **Preload** | Bridge API definition, channel registration | Business logic, state management, heavy computation |

### Anti-Patterns

```tsx
// ❌ Wrong — Business logic in preload
// preload.ts
contextBridge.exposeInMainWorld('api', {
  getActiveUsers: async () => {
    const all = await ipcRenderer.invoke('get-users')
    return all.filter(u => u.isActive) // Business logic in preload!
  },
})

// ✅ Correct — Preload is a thin bridge
// preload.ts
contextBridge.exposeInMainWorld('api', {
  getActiveUsers: () => ipcRenderer.invoke('get-active-users'),
})

// main/ipc/users.ipc.ts — Business logic in main
ipcMain.handle('get-active-users', async () => {
  const users = await db.getUsers()
  return users.filter(u => u.isActive)
})
```

---

## IPC Type Safety

[↑ top](#table-of-contents)

### Core Concept

**Define IPC channels and their payloads in a shared type file.** Both main and renderer import from this file. No stringly-typed channel names scattered across the codebase.

### The Pattern

```tsx
// shared/ipc-channels.ts — Single source of truth
export const IPC = {
  TRADES: {
    FETCH: 'trades:fetch',
    SUBSCRIBE: 'trades:subscribe',
    UPDATE: 'trades:update',
  },
  SETTINGS: {
    GET: 'settings:get',
    SET: 'settings:set',
  },
} as const

// Payload types for each channel
export interface IpcPayloads {
  'trades:fetch': { filter?: TradeFilter }
  'trades:subscribe': { symbols: string[] }
  'trades:update': Trade
  'settings:get': void
  'settings:set': Partial<AppSettings>
}

export interface IpcResponses {
  'trades:fetch': Trade[]
  'trades:subscribe': void
  'trades:update': void
  'settings:get': AppSettings
  'settings:set': void
}
```

```tsx
// Typed invoke wrapper
// preload.ts
function typedInvoke<C extends keyof IpcPayloads>(
  channel: C,
  payload: IpcPayloads[C]
): Promise<IpcResponses[C]> {
  return ipcRenderer.invoke(channel, payload)
}

contextBridge.exposeInMainWorld('electronAPI', {
  fetchTrades: (filter?: TradeFilter) =>
    typedInvoke(IPC.TRADES.FETCH, { filter }),
  // ...
})
```

### Anti-Patterns

```tsx
// ❌ Wrong — Magic strings everywhere
ipcRenderer.invoke('get-trades')           // In renderer
ipcMain.handle('get-trades', handler)      // In main — hope the strings match!
ipcRenderer.invoke('getTrades')            // Oops, different casing in another file

// ❌ Wrong — Untyped payloads
ipcRenderer.invoke('update-settings', { theme: 'dark' }) // What shape is this?
```

### Summary

1. **Single file for all channel definitions** — `shared/ipc-channels.ts`
2. **Type-safe payloads and responses** — compiler catches mismatches
3. **Typed invoke wrapper** — no raw `ipcRenderer.invoke` calls
4. **Namespace channels** — `domain:action` pattern (e.g., `trades:fetch`)

---

## Security Hardening

[↑ top](#table-of-contents)

### Non-Negotiable Settings

```tsx
// main.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,      // ✅ MUST be true
    nodeIntegration: false,      // ✅ MUST be false
    sandbox: true,               // ✅ Enable renderer sandbox
    preload: path.join(__dirname, 'preload.js'),
  },
})

// ❌ NEVER do this
webPreferences: {
  nodeIntegration: true,         // 🚨 P0 security vulnerability
  contextIsolation: false,       // 🚨 P0 security vulnerability
}
```

### Summary

1. **`contextIsolation: true`** — always
2. **`nodeIntegration: false`** — always
3. **`sandbox: true`** — always for renderer
4. **Validate IPC inputs in main** — renderer is untrusted
5. **Never expose `ipcRenderer` directly** — use `contextBridge`

---

# Architecture Principles

[↑ top](#table-of-contents)

---

## File Size & Decomposition

[↑ top](#table-of-contents)

### Core Concept

**Large files are the single biggest predictor of bugs, merge conflicts, and slow onboarding.** A file over 250 lines is a smell. Over 400 is a refactoring emergency. This applies to components, stores, utilities, and services alike.

### Hard Limits

| File Type | Target | Smell | Emergency |
|-----------|--------|-------|-----------|
| React component file | < 150 | > 250 | > 400 |
| Custom hook | < 50 | > 80 | > 120 |
| Zustand store | < 80 | > 120 | > 200 |
| Utility module | < 100 | > 150 | > 250 |
| Type definitions | < 80 | > 120 | > 200 |
| IPC handler | < 60 | > 100 | > 150 |
| Test file | < 200 | > 300 | > 500 |

### Decomposition Triggers

When a file exceeds its smell threshold, look for these split points:

| Signal | Action |
|--------|--------|
| Multiple `// Section:` comments | Each section → own file |
| Component renders multiple "areas" | Each area → child component |
| Hook manages multiple concerns | Split into focused hooks |
| Store has 10+ fields | Split into slices or separate stores |
| File has both types and logic | Types → `*.types.ts` |
| File has both pure utils and impure code | Split pure from impure |

---

## Dependency Direction

[↑ top](#table-of-contents)

### Core Concept

**Dependencies flow in one direction: from features to shared, from renderer to shared types, never in cycles.** If module A imports from module B, module B must not import from module A (directly or transitively).

```
features/order-entry → shared/components
features/order-entry → shared/types
features/trade-blotter → shared/types
shared/types ← (nothing imports from features)

❌ features/order-entry → features/trade-blotter → features/order-entry
```

### The Dependency Rule

Allowed:
- Feature → shared
- Feature → shared types (cross-process)
- Component → hook (same feature)
- Store → types (same feature)

Not allowed:
- Feature → Feature (create shared abstraction or use event/store)
- Shared → Feature (shared must be feature-agnostic)
- Renderer → Main (use IPC)
- Circular anything

---

## Error Handling Strategy

[↑ top](#table-of-contents)

### Core Concept

**Errors are values, not surprises.** Handle them explicitly at each layer. Never swallow errors silently. Use discriminated union Result types for expected failures. Use Error Boundaries for unexpected React crashes. Use structured error types, not string messages.

### The Error Hierarchy

```tsx
// Structured error types
type AppError =
  | { kind: 'validation'; field: string; message: string }
  | { kind: 'network'; status: number; retryable: boolean }
  | { kind: 'ipc'; channel: string; cause: unknown }
  | { kind: 'unexpected'; cause: unknown }

// Result type for expected failures
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

// Usage
async function submitOrder(order: CreateOrderInput): Promise<Result<Order>> {
  try {
    const response = await api.post('/orders', order)
    return { ok: true, value: OrderSchema.parse(response) }
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: { kind: 'validation', field: '...', message: '...' } }
    }
    return { ok: false, error: { kind: 'network', status: 500, retryable: true } }
  }
}
```

### Anti-Patterns

```tsx
// ❌ Wrong — Silent catch (the worst)
try {
  await saveData()
} catch (e) {
  // nothing. data silently lost.
}

// ❌ Wrong — console.log as error handling
try {
  await saveData()
} catch (e) {
  console.log('error', e)
}

// ❌ Wrong — Generic error message
try {
  await saveData()
} catch (e) {
  setError('Something went wrong')
}

// ✅ Correct — Structured, visible, actionable
const result = await saveData()
if (!result.ok) {
  if (result.error.kind === 'network' && result.error.retryable) {
    enqueueRetry(saveData)
  } else {
    showError(formatError(result.error))
    reportToTelemetry(result.error)
  }
}
```

### React Error Boundaries

```tsx
// Every feature should have an error boundary
<ErrorBoundary fallback={<TradeBlotterError />}>
  <TradeBlotter />
</ErrorBoundary>

// NOT one giant error boundary at the app root
```

### Summary

1. **Never catch and ignore** — every catch block must handle or propagate
2. **Result types for expected failures** — network errors, validation errors
3. **Error boundaries per feature** — isolate failures
4. **Structured error types** — discriminated unions, not strings
5. **Report to telemetry** — errors you don't see are errors you can't fix

---

## Naming & Conventions

[↑ top](#table-of-contents)

### File Naming

| Type | Convention | Example |
|------|-----------|---------|
| React component | `PascalCase.tsx` | `TradeBlotter.tsx` |
| Hook | `use*.ts` | `useOrderValidation.ts` |
| Store | `*.store.ts` | `trades.store.ts` |
| Types | `*.types.ts` | `order.types.ts` |
| Utils | `*.utils.ts` | `currency.utils.ts` |
| Constants | `*.constants.ts` | `trade.constants.ts` |
| IPC handlers | `*.ipc.ts` | `trades.ipc.ts` |
| Tests | `*.test.tsx` / `*.test.ts` | `TradeBlotter.test.tsx` |
| Barrel | `index.ts` | `index.ts` |

### Variable & Function Naming

```tsx
// ❌ Wrong — Abbreviations and unclear names
const usr = getUsr()
const handleCB = () => { /* ... */ }
const data = await fetch(url)

// ✅ Correct — Full words, intention-revealing
const currentUser = getCurrentUser()
const handleTradeConfirmation = () => { /* ... */ }
const tradeResponse = await fetchTrades(filter)
```

### Boolean Naming

```tsx
// ❌ Wrong
const open = true
const loading = true
const data = true

// ✅ Correct — Prefix with is/has/can/should
const isOpen = true
const isLoading = true
const hasData = true
const canSubmit = true
const shouldRetry = true
```

### Event Handler Naming

```tsx
// ❌ Wrong — Inconsistent handler naming
onClick={handleClick}
onSubmit={submit}
onChange={e => setVal(e.target.value)}
onClose={closeModal}

// ✅ Correct — Consistent on*/handle* convention
// Props: on* (what happened)
// Handlers: handle* (what we do about it)
interface TradeRowProps {
  onSelect: (tradeId: TradeId) => void   // Event prop
  onCancel: (tradeId: TradeId) => void   // Event prop
}

function TradeRow({ onSelect, onCancel }: TradeRowProps) {
  const handleRowClick = () => onSelect(trade.id)     // Handler
  const handleCancelClick = () => onCancel(trade.id)   // Handler
}
```

---

## Testing Strategy

[↑ top](#table-of-contents)

### Core Concept

**Test behavior, not implementation.** Tests should verify what the user sees and does, not which internal functions were called. If refactoring breaks your tests but not your features, your tests are wrong.

### The Testing Pyramid for Electron + React

| Layer | Tool | Tests | What It Catches |
|-------|------|-------|-----------------|
| **Unit** | Vitest | Pure functions, store logic, transformations | Logic bugs |
| **Component** | Vitest + Testing Library | User interactions, rendering | UI bugs |
| **Integration** | Vitest | IPC handlers, store + API | Wiring bugs |
| **E2E** | Playwright | Critical user flows | System-level bugs |

### Testing Principles

1. **DAMP over DRY in tests** — Descriptive and Meaningful Phrases. Repeat setup if it aids readability.
2. **Arrange-Act-Assert** — Three clear sections per test.
3. **Test user behavior** — `getByRole`, `getByText`, not `getByTestId` (which tests implementation).
4. **One assertion per behavior** — Test one thing well, not many things vaguely.

---

# Universal Clean Code Principles

[↑ top](#table-of-contents)

> *These principles are language-agnostic but apply with full force to TypeScript/React/Electron codebases. They are condensed here — each is important enough to deserve its own section in a comprehensive reference.*

---

## KISS: Keep It Simple

**Avoid unnecessary complexity.** Measured by: can a new team member understand this in one read?

| Violation | Fix |
|-----------|-----|
| Nested ternaries in JSX | Extract to variable or early return |
| Generic `<T extends ...>` when concrete type works | Use the concrete type |
| Higher-order component when a hook works | Use a hook |
| Observable/RxJS when a callback works | Use a callback |
| Custom state machine library for 3 states | Discriminated union |

## YAGNI: You Aren't Gonna Need It

**Don't build until needed.** Applies especially to: plugin architectures, "flexible" config systems, abstract base classes, generic frameworks for one use case.

```tsx
// ❌ Wrong — GenericDataProvider that only provides trades
// ✅ Correct — TradesProvider that provides trades
```

## DRY: Don't Repeat Yourself (With Nuance)

**DRY applies to knowledge, not code.** Two components that look similar but serve different business purposes should NOT be merged. Wait for the Rule of Three.

## Guard Clauses

**Exit early for invalid states.** Keeps the happy path at the top level of indentation.

```tsx
// ❌ Wrong
function processOrder(order: Order | null) {
  if (order) {
    if (order.items.length > 0) {
      if (order.status === 'pending') {
        // actual logic buried at indent level 3
      }
    }
  }
}

// ✅ Correct
function processOrder(order: Order | null) {
  if (!order) return
  if (order.items.length === 0) return
  if (order.status !== 'pending') return

  // actual logic at indent level 1
}
```

## Cognitive Load

**Working memory holds ~4 chunks.** Reduce the number of things a reader must hold in their head:

- Named intermediates for complex conditions
- Small functions with clear names
- Flat control flow (guard clauses)
- Colocated related code
- Consistent patterns across the codebase

---

# When to Relax Rules

[↑ top](#table-of-contents)

| Context | Relaxed Principles | Why |
|---------|-------------------|-----|
| **Prototypes/Spikes** | All | Exploring, not building. Throw it away. |
| **Test Code** | DRY, file size | DAMP (Descriptive And Meaningful Phrases) > DRY. Test readability trumps deduplication. |
| **Hot-path rendering** (AG-Grid cell renderers) | Abstraction, hooks | Performance-critical code may need inlining. Profile first. |
| **Electron main process scripts** | React patterns | No React here — different paradigm. |
| **Migration / interop** | Strict typing | Bridging legacy code may need `as` assertions temporarily — mark with `// MIGRATION:` comments. |
| **Generated code** | All | Don't hand-edit generated code. Fix the generator. |
| **One-off scripts** | Modularity, SRP | Overhead exceeds benefit for throwaway code. |
| **Third-party library wrappers** | No `any` rule | Sometimes `any` is needed to bridge untyped libs. Contain it to the wrapper. |

### The Meta-Principle

> **"Rules are for the guidance of wise men and the obedience of fools."** — Douglas Bader

Principles are heuristics, not laws. Understand WHY before applying. If following a rule makes the code worse, don't follow it — but document why you're making an exception.

---

# References

[↑ top](#table-of-contents)

### TypeScript & React

| Resource | Key Contribution |
|----------|------------------|
| [React 19 Blog Post](https://react.dev/blog/2024/12/05/react-19) | Official guide to `use()`, Actions, `useOptimistic` |
| [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | React team's guide to eliminating useEffect |
| [Zustand Documentation](https://docs.pmnd.rs/zustand) | Lightweight state management |
| [Total TypeScript](https://www.totaltypescript.com/) | Matt Pocock's TypeScript patterns |
| [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security) | Official security guidance |

### Foundational Texts

| Book | Author(s) | Key Contribution |
|------|-----------|------------------|
| *The Pragmatic Programmer* | Andy Hunt & Dave Thomas | DRY, orthogonality, tracer bullets |
| *A Philosophy of Software Design* | John Ousterhout | Deep vs. shallow modules, complexity as the root problem |
| *Clean Code* | Robert C. Martin | Function size, naming, SRP |
| *Refactoring* | Martin Fowler | Systematic code improvement techniques |

### Seminal Articles

| Article | Author | Key Idea |
|---------|--------|----------|
| [Parse, Don't Validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) | Alexis King | Transform data into types that prove validity |
| [The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction) | Sandi Metz | Duplication is far cheaper than the wrong abstraction |
| [Cognitive Load is What Matters](https://github.com/zakirullin/cognitive-load) | Artem Zakirullin | Minimize mental effort to understand code |
