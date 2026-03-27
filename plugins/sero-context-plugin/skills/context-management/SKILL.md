---
name: context-management
description: Strategies for efficient context management using context_log, context_tag, and context_checkout. Learn when to tag, how to visualize the graph, and safe ways to squash history. Use for complex refactoring, debugging, and long conversations.
---

# Context Management

**CRITICAL: THIS SKILL MANAGES YOUR MEMORY. WITHOUT IT, YOU WILL FORGET.**

Your context window is limited. As conversations grow, "pollution" (noise, failed attempts) degrades your reasoning.

**YOU MUST PROACTIVELY MANAGE YOUR HISTORY.**
Do not wait for the user to tell you.

## The Core Philosophy: Build, Perceive, Navigate

```
Context Window = RAM (Expensive, volatile, limited)
Context Graph  = Disk (Cheap, persistent, unlimited)

→ Move finished tasks from RAM to the Graph.
```

Manage your context window like a Git repository. You are the maintainer.

1.  **BUILD the Skeleton (`context_tag`)**:
    *   Raw conversation is a flat list. **Tags create structure.**
    *   Without tags, `context_log` is just a list of IDs. With tags, it is a **Map**.
2.  **PERCEIVE the State (`context_log`)**:
    *   Check the HUD: Is "Segment Size" too big? You are drifting.
    *   Check the Graph: Where are you? Are you in a deep branch?
3.  **NAVIGATE & MERGE (`context_checkout`)**:
    *   **Squash:** Convert a messy "feature branch" (thinking process) into a single "merge commit" (summary).
    *   **Jump:** Move between tasks or retry paths without carrying baggage.

## Quick Start: The Loop

Follow this cycle for every major task:

1.  **CHECK:** Verify state.
    `context_log`
2.  **START:** Tag the beginning with a semantic name.
    `context_tag({ name: "<task-slug>-start" })`  // e.g., `auth-login-start`
3.  **WORK:** Execute steps.
4.  **MILESTONE:** Tag intermediate stable states.
    `context_tag({ name: "<task-slug>-plan" })`  // e.g., `auth-login-plan`
5.  **SQUASH (Autonomous):** If history becomes noisy or low-density, **Squash with Backup**.
    *   *Action:* `context_checkout({ target: "<task-slug>-start", message: "...", backupTag: "<task-slug>-raw-history" })`
    *   *Action (Optional):* `context_tag({ name: "<task-slug>-done" })`
    *   *Safety:* If you need the details later, checkout the backup tag.

## Tool Reference

| Tool | Analog | Purpose | When to Use |
| :--- | :--- | :--- | :--- |
| `context_tag` | `git tag` | Bookmark a stable state. | Before risky changes. Before starting a new task. |
| `context_log` | `git log` | See where you are. | When you feel lost. To find IDs for checkout. |
| `context_checkout`| `git reset --soft` | **Time Travel / Squash.** | To undo mistakes. To compress history. |

## Critical Rules

### Tag Wisely (Build The Skeleton)

Tags are the "Table of Contents". Name them so you can understand the history at a glance.

**Naming Formula:** `<task-slug>-<phase>`

*   **task-slug**: Short, kebab-case identifier for the task (e.g., `auth-login`, `db-migration`)
*   **phase**: The stage of work (`start`, `plan`, `impl`, `done`, `fail`, `backup`)

| Bad (Generic) | Good (Semantic) | Why |
| :--- | :--- | :--- |
| `task-start` | `auth-oauth-start` | Describes WHAT task |
| `pre-research` | `error-log-analysis-start` | Future-you knows the topic |
| `phase-1-done` | `db-schema-plan-done` | Know which phase of which task |
| `debug-retry` | `null-pointer-fix-retry` | What bug? |

**Tag Categories:**

| Category | Pattern | Examples |
| :--- | :--- | :--- |
| **Start** | `<task>-start` | `auth-jwt-start`, `docker-setup-start` |
| **Plan** | `<task>-plan` | `api-v2-plan`, `migration-plan` |
| **Milestone** | `<task>-<milestone>` | `auth-jwt-impl-done`, `tests-passed` |
| **Backup** | `<task>-raw-history` | `auth-jwt-raw-history` |
| **Failure** | `<task>-fail-<reason>` | `auth-jwt-fail-timeout` |

**How to generate:** Ask yourself "What is the task?" → Extract 1-3 keywords (e.g., "fix login timeout" → `login-timeout-fix-start`)

### Squash Noise, Keep Signal, Focus on Goal (Context Hygiene)
Think of your conversation as a "Feature Branch" full of messy thoughts.
**You must distinguish Signal from Noise.**

*   **Signal (High Value):** Design decisions, user constraints, final working code. -> **KEEP.**
*   **Noise (Low Value):** Failed attempts, long tool outputs, "thinking" steps. -> **SQUASH.**
*   **Focus on Goal:** Ask yourself: "Does this message help me achieve the current goal?" -> **KEEP.**

**When to Squash:**
1.  **Task Done:** Convert the messy process into one clean summary.
2.  **Low Density:** You read 2000 lines but only found 1 error.

**Safety:** Squashing is **LOSSLESS**.
By using `backupTag`, you save the "Messy Branch" forever. You can always checkout the backup tag if the summary isn't enough.
*   **Main Trunk:** Jump back to the summary.
*   **Backup Tag:** Jump back to the raw details.

### Fail Fast, Revert Faster
If you fail 3 times:
1.  **STOP.** Don't try a 4th time.
2.  `context_checkout` back to the last safe tag.
3.  Summarize the failure in the checkout message ("Tried X, failed because Y").
4.  Try a new approach from the clean state.

## Decision Matrix: When to Act

| Situation | Action | Reason |
| :--- | :--- | :--- |
| **Starting Task** | `context_tag({ name: "<task-slug>-start" })` | Create a rollback point. |
| **Research / Logs** | `context_checkout` (Squash) | **Process is Noise.** Read 2000 lines -> Keep result. |
| **Messy Debugging** | **Squash w/ Backup** | **Cleanup.** The error logs are noise once fixed. |
| **Task Done (Candidate)**| **Squash w/ Backup** | **Assume Success.** Summary is usually enough. Backup exists if not. |
| **Goal Shift** | `context_checkout` (Squash) | Old context is irrelevant. |
| **Drift (some steps w/o tag)** | **Tag (Milestone)** | Maintain the skeleton. Don't fly blind. |

## The "Context Health" Check

If you cannot answer these, run `context_log`:

| Question | Answer Source |
| :--- | :--- |
| **Where is the skeleton?** | The sequence of `tag`s in the log. |
| **Is this history useful?** | If "No" -> **SQUASH IT.** |
| **Am I in a loop?** | Repeated entries in the graph. |


## Good Checkout Messages

The `message` is your lifeline to your past self.
A good message preserves critical context that would otherwise be lost.

Structure: `[Key Finding/Status] + [Reason] + [Important Changes]`

*   **Key Finding/Status**: What did you discover or complete? Include specific numbers, errors, or outcomes.
*   **Reason**: Why are you branching/moving? (e.g., "Task complete", "Approach failed", "Need raw logs")
*   **Important Changes**: What files or logic have been modified? (This checkout only resets *conversation history*, NOT disk files, so you must remember what changed.)

Examples:

*   *Good (Resetting after failure)*: "Recursive parser hit stack overflow at depth 8000. Switching to iterative. **Reason**: Stack limit reached. **Important Changes**: Modified `utils/recursion.ts`."
*   *Good (Cleaning up)*: "Auth module complete: JWT + OAuth2 + RBAC. 23 tests passing. **Reason**: Task done, cleaning context. **Important Changes**: Created `auth/`, modified `routes.ts` and `middleware.ts`."
*   *Bad*: "Switching context." (Too vague - you will forget why)
*   *Bad*: "Done." (What is done? What did we learn?)

## Anti-Patterns

| Don't | Do Instead |
| :--- | :--- |
| **Blind Tagging** (Tagging without looking) | **Check** (`context_log`) to avoid duplicates or tagging noise. |
| **Over-Tagging** (Tagging every step) | **Tag** only major phase changes (`start`, `milestone`). |
| **Hoard** (Keep all history "just in case") | **Squash** low-density history (research, logs). |
| **Panic** (Apologize repeatedly for errors) | **Revert** (`context_checkout`) to before the error. |
| **Blind Checkout** (Guessing IDs) | **Look** (`context_log`) first to get valid IDs. |
| **Vague Summaries** ("Done", "Fixed") | **Detailed Summaries** ("Found bug in line 40. Fixed with patch X.") |
| **Generic Tag Names** (`task-start`, `phase-1`) | **Semantic Names** (`auth-jwt-start`, `db-schema-plan`) |

## Recipes (Copy-Paste)

### 1. The "Miner" (Immediate Squash)
**Goal:** Pure information gathering (Reading files, Searching web).
**Why:** The *process* of searching is irrelevant. Only the *result* matters.

**Example Task:** Analyzing error logs to find root cause of timeout

```javascript
// 1. Tag BEFORE starting the noisy work (use descriptive name)
context_tag({ name: "timeout-analysis-start" });

// ... (Read 5 log files, search 3 docs, find DB connection pool exhaustion) ...

// 2. Squash IMMEDIATELY. Do not wait for user.
context_checkout({
  target: "timeout-analysis-start",
  message: "Found DB connection pool exhaustion as root cause (pool size: 10, peak load: 1000 req/s). Recommended fix: increase to 50. **Reason**: Context cleanup after research. **Important Changes**: None (read-only).",
  backupTag: "timeout-analysis-raw-history" // Safety backup
});
context_tag({ name: "timeout-analysis-done" });
```

### 2. The "Candidate" (Wait for Confirmation)
**Goal:** You finished a complex task.
**Why:** The history is noisy. The result is clean.
**Safety:** We create a backup tag automatically.

**Example Task:** Implementing OAuth login flow

```javascript
// Squash to Summary (Optimistic Cleanup)
context_checkout({
  target: "oauth-impl-start", // Squash range: Start -> Now
  message: "OAuth2 flow implemented with PKCE, Google + GitHub providers. All 12 tests passing. **Reason**: Task complete, cleaning up. **Important Changes**: Created `auth/oauth.ts`, modified `routes.ts`, `config.ts`. Backup at 'oauth-impl-raw-history'.",
  backupTag: "oauth-impl-raw-history"
});
context_tag({ name: "oauth-impl-candidate" });
```

### 3. The "Undo" (Revert Squash)
**Goal:** User asks about a detail you squashed away.
**Action:** Jump back to the backup tag.

**Example Task:** Reviewing OAuth implementation details

```javascript
// Jump back to the raw history
context_checkout({
  target: "oauth-impl-raw-history",
  message: "Reviewing token refresh logic - user reports 401 after 15 min idle. Suspect refresh token not firing. **Reason**: Need raw logs to trace the bug. **Important Changes**: None."
});
context_tag({ name: "oauth-review-start" });
```

### 4. Branching (Alternative Approach)
**Scenario:** Method A failed (and was squashed). You want to try Method B from the clean state.
**Action:** Checkout the start point.

**Example Task:** Fixing memory leak - trying different approaches

```javascript
// Method A (weak references) failed, trying Method B (object pooling)
context_checkout({
  target: "memory-leak-fix-start", 
  message: "WeakRef approach failed: objects GC'd within 30s (expected: 5min). Cache hit rate dropped from 95% to 12%. **Reason**: Switching to object pooling approach. **Important Changes**: `CacheManager.ts` modified (will revert)."
});
context_tag({ name: "memory-leak-pool-approach-start" });
```

### 5. The "Undo" (Failed Attempt)
You tried to fix a bug but broke everything.
**Goal:** Clean up a failed path.

**Example Task:** Fixing race condition in async handler

```javascript
// Attempted mutex-based fix, but introduced deadlock
context_checkout({
  target: "race-condition-fix-start",
  message: "Mutex caused deadlock: Thread A holds mutex, awaits callback; callback needs mutex held by B; B waits for A. Circular wait detected. **Reason**: Trying lock-free CAS approach next. **Important Changes**: `AsyncQueue.ts` lines 70-90 modified (backup saved).",
  backupTag: "race-condition-mutex-fail" // Save the failure for reference
});
context_tag({ name: "race-condition-lockfree-start" });
```
