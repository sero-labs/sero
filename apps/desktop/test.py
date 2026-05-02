"""
Token baseline verification script.

Run after sending a single message ("hi") in a fresh Sero session
with debug logging enabled.

Usage:
    python3 apps/desktop/test.py

Checks:
    1. Debug log: system prompt size, tool count, no Open Workspaces, no AGENTS.md dupe
    2. Latest session file: actual cacheWrite token count from the API
"""

import json
import os
import glob

HOME = os.path.expanduser("~")
DEBUG_LOG = os.path.join(HOME, ".sero-ui/debug/model-messages.jsonl")
SESSIONS_DIR = os.path.join(HOME, ".sero-ui/agent/sessions")

print("=" * 60)
print("  SERO TOKEN BASELINE VERIFICATION")
print("=" * 60)

# ── 1. Debug log analysis ────────────────────────────────────

print("\n── Debug Log ──\n")

if not os.path.exists(DEBUG_LOG):
    print(f"❌ Debug log not found: {DEBUG_LOG}")
    print("   Toggle debug logging ON in the status bar, then send a message.")
    exit(1)

turn_context = None
with open(DEBUG_LOG) as f:
    for line in f:
        data = json.loads(line)
        if data.get("_type") == "turn_context":
            turn_context = data
            break

if not turn_context:
    print("❌ No turn_context entry found in debug log.")
    print("   Send a message with debug logging enabled.")
    exit(1)

prompt = turn_context["systemPrompt"]
tools = turn_context["tools"]
prompt_chars = len(prompt)
estimated_tokens = prompt_chars / 2.8

print(f"System prompt:    {prompt_chars:,} chars")
print(f"Estimated tokens: {estimated_tokens:,.0f}")
print(f"Tools:            {len(tools)}")
for t in tools:
    print(f"  • {t['name']}")

print()

# Checks
has_open_ws = "Open Workspaces" in prompt
agents_count = prompt.count("# AGENTS.md")
has_dupe = agents_count > 1

print(f"Open Workspaces in prompt?   {'YES ⚠️' if has_open_ws else 'NO ✅'}")
print(f"AGENTS.md duplicated?        {'YES ⚠️' if has_dupe else 'NO ✅'} (found {agents_count}x)")
print(f"Tool count correct (9)?      {'YES ✅' if len(tools) == 9 else f'NO ⚠️  (got {len(tools)})'}")

# Section breakdown
print("\n── Prompt Section Breakdown ──\n")

sections = []
current_header = "(preamble)"
current_start = 0
lines = prompt.split("\n")

for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith("## ") and not stripped.startswith("### "):
        section_text = "\n".join(lines[current_start:i])
        sections.append((current_header, len(section_text)))
        current_header = stripped
        current_start = i

section_text = "\n".join(lines[current_start:])
sections.append((current_header, len(section_text)))

print(f"{'Section':<55} {'Chars':>6} {'~Tokens':>8}")
print("-" * 75)
for header, chars in sections:
    if chars > 100:
        tokens = chars / 2.8
        print(f"{header[:54]:<55} {chars:>6} {tokens:>8.0f}")
print("-" * 75)
print(f"{'TOTAL':<55} {sum(c for _, c in sections):>6} {sum(c / 2.8 for _, c in sections):>8.0f}")

# ── 2. Session file analysis ─────────────────────────────────

print("\n── Latest Session (actual API tokens) ──\n")

session_files = sorted(glob.glob(os.path.join(SESSIONS_DIR, "*.jsonl")), key=os.path.getmtime)
if not session_files:
    print("❌ No session files found.")
    exit(1)

latest = session_files[-1]
print(f"File: {os.path.basename(latest)}")

assistant_msg = None
with open(latest) as f:
    for line in f:
        data = json.loads(line)
        if data.get("type") == "message":
            msg = data.get("message", {})
            if msg.get("role") == "assistant" and "usage" in msg:
                assistant_msg = msg
                break

if not assistant_msg:
    print("❌ No assistant message with usage data found.")
    exit(1)

u = assistant_msg["usage"]
cache_write = u.get("cacheWrite", 0)
total = u.get("totalTokens", 0)

print(f"Cache write:      {cache_write:,} tokens (system prompt + tool schemas)")
print(f"Total tokens:     {total:,}")

print()

# ── 3. Summary ───────────────────────────────────────────────

print("── Summary ──\n")
print(f"  Before optimisations:  13,342 tokens")
print(f"  Current actual:        {cache_write:,} tokens")
print(f"  Reduction:             {13342 - cache_write:,} tokens ({(13342 - cache_write) / 13342 * 100:.0f}%)")

all_pass = not has_open_ws and not has_dupe and len(tools) == 9 and cache_write < 12_000
print()
if all_pass:
    print("  ✅ ALL CHECKS PASSED")
else:
    print("  ⚠️  SOME CHECKS FAILED")
    if has_open_ws:
        print("     - Open Workspaces still in system prompt")
    if has_dupe:
        print("     - AGENTS.md appears more than once")
    if len(tools) != 9:
        print(f"     - Expected 9 tools, got {len(tools)}")
    if cache_write >= 12_000:
        print(f"     - Cache write {cache_write:,} exceeds 12,000 token budget")
