# Subagent Orchestration — Manual E2E Test Procedures

> Covers all modes, abort, create_agent, and UI verification.

## Prerequisites

1. Desktop app running (`bash scripts/dev.sh` from `apps/desktop/`)
2. At least one workspace open
3. A valid API key configured

---

## Test 1: Single Mode — Named Agent

**Steps:**
1. Open a chat session in any workspace
2. Ask: "Use the scout subagent to scan the project structure"
3. Observe the ChatPanel shows tool progress lines:
   - `🔄 scout started — "..."`
   - `✅ scout completed (Xs, Y tokens)`
4. The agent receives the full scout response and uses it

**Expected:**
- `subagent` tool call appears in tool output
- Progress lines stream in real-time
- Response text is untruncated

---

## Test 2: Single Mode — Ad-hoc

**Steps:**
1. Ask: "Use a subagent with an inline system prompt 'You are a counter. Count to 5.' and the task 'Count now.'"
2. Observe the tool call uses `systemPrompt` parameter

**Expected:**
- Agent name shows as "ad-hoc" in orchestration panel
- Response contains the count

---

## Test 3: Parallel Mode

**Steps:**
1. Ask: "Use subagents in parallel to: (1) scout scan the src/ directory, (2) scout scan the electron/ directory, (3) scout scan the docs/ directory"
2. Watch the orchestration panel (click Network icon in activity bar)

**Expected:**
- 3 entries appear in orchestration panel simultaneously
- Progress lines stream for each (`🔄 ... started`)
- Results formatted as `## Result 1: scout — "..."` sections
- All 3 complete independently

---

## Test 4: Chain Mode

**Steps:**
1. Ask: "Chain two subagents: first scout to map the project structure, then analyst to analyse the scout's findings. Use {previous} in the second step."
2. Watch the orchestration panel

**Expected:**
- Step 1 starts and completes
- Step 2 starts only after Step 1 finishes
- Step 2's task contains the output of Step 1
- Final response is the analyst's output

---

## Test 5: create_agent Tool

**Steps:**
1. Ask: "Create a new agent called 'summariser' that summarises text concisely"
2. Check `~/.sero-ui/agent/agents/summariser.md` exists
3. Ask: "Use the summariser subagent to summarise this conversation"

**Expected:**
- Agent file created with JSON frontmatter
- New agent immediately discoverable (no restart needed)
- Subagent runs successfully

---

## Test 6: Abort Mid-Execution

**Steps:**
1. Start a long subagent task (e.g. "Use the analyst subagent to do a deep analysis of the entire codebase")
2. While running, click the Stop button or press Escape
3. Check the orchestration panel

**Expected:**
- Subagent entry shows "aborted" status
- Main agent receives abort / error
- No orphaned sessions

---

## Test 7: Orchestration Panel UI

**Steps:**
1. Click the Network icon in the coding workspace activity bar
2. Run a few subagent tasks (single + parallel)
3. Observe the panel

**Expected:**
- Running entries at top with animated indicator
- Completed entries below with ✅
- Failed entries with ❌ and red styling
- Each card shows: agent name, task preview, model, duration, tokens, cost
- Click "▼ Output" to expand full response
- Summary bar at bottom: "N runs · $X.XX · Xk tokens · Xs"

---

## Test 8: Snapshot Hydration

**Steps:**
1. Run some subagent tasks
2. Switch to a different activity bar panel (e.g. Explorer)
3. Switch back to Orchestration

**Expected:**
- Previous entries still visible (hydrated from snapshot)
- Running entries update live

---

## Test 9: Workspace Switch

**Steps:**
1. Run subagent tasks in Workspace A
2. Switch to Workspace B
3. Open Orchestration panel

**Expected:**
- Panel shows entries for Workspace B only (empty if no tasks)
- Switch back to Workspace A → entries restored
