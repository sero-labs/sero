# /research — Multi-Agent Research Orchestrator

Decompose a research question into parallel agent workstreams, launch them, monitor progress, and synthesize results.

---

## Phase 1: Plan the Research

When the user asks to research something:

1. **Understand the question.** What exactly are we trying to learn? Who is it for? What decisions will it inform?

2. **Decompose into agent workstreams.** Each agent should have:
   - A clear, non-overlapping scope (e.g., "Market sizing & competitive landscape", "Technical feasibility & architecture", "Regulatory & compliance landscape")
   - 3-6 specific sections they must write
   - A target output length (~500-1500 lines of markdown per agent is the sweet spot)

3. **Plan the synthesis agent.** This runs AFTER all research agents complete. Its job is to read all agent outputs and produce a single coherent synthesis document with cross-cutting insights, contradictions, and recommendations.

4. **Present the plan to the user.** Format:

```
## Research Plan: [Topic]

### Agent 1: [Name]
**Scope:** [1-2 sentence scope]
**Sections:**
1. [Section name]
2. [Section name]
3. ...
**Output file:** research/[topic]/[agent-name].md

### Agent 2: [Name]
...

### Synthesis Agent
**Runs after:** All research agents complete
**Output file:** research/[topic]/synthesis.md
```

5. **Wait for user approval** before proceeding. Do NOT launch agents until the user confirms the plan.

---

## Phase 2: Create Skeleton Files

Once the user approves the plan:

1. **Create the output directory:** `research/[topic]/`

2. **For each research agent, create a skeleton markdown file** at the planned path. The skeleton MUST include:

```markdown
# [Agent Name]: [Scope Title]

**Status:** IN PROGRESS
**Last updated:** [timestamp]

---

## CRITICAL INSTRUCTIONS FOR AGENT

> **YOU WILL BE STOPPED AND RELAUNCHED IF YOU VIOLATE THIS PROTOCOL.**
>
> The ONLY acceptable pattern is: **Search -> Edit -> Search -> Edit -> Search -> Edit.**
> NEVER: Search -> Search. NO EXCEPTIONS. NOT EVEN ONCE.
>
> After EVERY search or fetch, IMMEDIATELY Edit this file with what you learned.
> If you do two searches in a row without an Edit to this file, you are VIOLATING THE PROTOCOL and will be killed.
>
> Work through sections in order. For each section:
> 1. Search/fetch for information
> 2. IMMEDIATELY write findings to this file under that section
> 3. Search/fetch for more information on the same section
> 4. IMMEDIATELY update this file with additional findings
> 5. Move to next section only after writing current section
>
> If a web fetch returns a 403 error, WRITE WHAT YOU HAVE before trying another URL.
>
> Every number needs a source. Every source needs a clickable URL inline.
> Do NOT collect sources at the end -- put them inline with the facts.
>
> When you are DONE with all sections, change "Status: IN PROGRESS" to "Status: COMPLETE" at the top.

---

## 1. [First Section Name]

[To be filled by research agent]

## 2. [Second Section Name]

[To be filled by research agent]

...
```

3. **Also create the synthesis skeleton** with similar critical instructions, but noting it should read from the other agent output files.

---

## Phase 3: Launch Research Agents

Launch ALL research agents in parallel using the Task tool with `run_in_background: true`.

Each agent prompt MUST include:

1. **The research question and their specific scope** -- be precise about boundaries
2. **The exact file path they must write to** -- absolute path
3. **The section list they must complete** -- numbered, in order
4. **The critical write protocol** -- copy verbatim:

```
CRITICAL WRITE PROTOCOL -- READ THIS BEFORE DOING ANYTHING:

YOU WILL BE STOPPED AND RELAUNCHED IF YOU VIOLATE THIS PROTOCOL.

The ONLY acceptable pattern is: Search -> Edit -> Search -> Edit -> Search -> Edit.
NEVER: Search -> Search. NO EXCEPTIONS. NOT EVEN ONCE.

You MUST Edit your output file after EVERY SINGLE search or web fetch.
If you do two searches in a row without an Edit to your file, you are VIOLATING THE PROTOCOL and will be killed.

Work through your sections IN ORDER (1, 2, 3...). For each section:
1. Do ONE search or web fetch
2. IMMEDIATELY Edit the file to write what you learned under that section
3. Do another search if needed
4. IMMEDIATELY Edit the file again with additional findings
5. Only move to the next section after the current one has real content

If a web fetch returns a 403 error, do NOT try multiple alternative URLs before writing.
Write what you have so far, THEN try another URL, THEN write again.

Every quantitative claim needs an inline source URL: [Source Name](https://url.com)
Do NOT put sources at the bottom. Inline only.

When ALL sections are complete, change the file's Status line from "IN PROGRESS" to "COMPLETE".
```

5. **Any relevant context files they should read first** -- provide absolute paths
6. **Use `subagent_type: "general-purpose"`** for all research agents

**IMPORTANT:** Use `run_in_background: true` for all research agents so they run in parallel.

After launching, tell the user how many agents are running and their output file paths.

---

## Phase 4: Monitor Progress

Use escalating check-in intervals:

### Check-in 1: ~30 seconds after launch
- Read each agent's output file to verify they've started writing
- Report to user: which agents have started writing, which haven't
- If any agent has an empty file (no content beyond the skeleton), flag it -- the agent may be stuck in a research loop

### Check-in 2: ~2 minutes after launch
- Read each agent's output file
- Report: approximate progress (which sections have content, rough line counts)
- Flag any agent that hasn't progressed since last check

### Check-in 3: ~5 minutes after launch
- Read each agent's output file
- Report: which agents are complete (Status: COMPLETE), which are still working
- **STUCK AGENT RULE:** If an agent's line count has NOT increased between two consecutive check-ins, it is stuck. Do NOT wait -- stop it immediately with TaskStop and relaunch (see Stuck Agent Recovery below).

### Subsequent check-ins: Every 5 minutes
- Continue until all agents show Status: COMPLETE or user intervenes

**How to check:** Use `wc -l` via Bash on all agent output files for a quick line count comparison. Then Read specific files only if you need to see what sections are done.

**How to report:** Keep it concise:
```
Agent check-in [#N]:
- Agent 1 (Market sizing): ~120 lines, sections 1-3 done, working on 4/6
- Agent 2 (Technical): ~80 lines, sections 1-2 done, working on 3/5
- Agent 3 (Regulatory): COMPLETE (185 lines)
```

### Stuck Agent Recovery

Agents get stuck when they hit 403 errors or fall into research loops (searching repeatedly without writing). When this happens:

1. **Stop the agent** immediately with TaskStop. Do not wait for it to self-correct -- it won't.
2. **Read the output file** to see what sections are already complete.
3. **Check the agent's process output** (tail the output_file from TaskOutput) to extract any useful data the agent found in search results but never wrote to the file.
4. **Relaunch with a new agent** that:
   - Is told which sections are already complete and to skip them
   - Is given any useful data extracted from the stuck agent's search results (pre-loaded in the prompt so it doesn't need to re-research)
   - Has even stricter write protocol language: "You WILL be stopped if you do two searches without an Edit. NO EXCEPTIONS."
   - Starts by writing pre-loaded data to the file FIRST, then searches for more
5. **Monitor the relaunched agent** on the same check-in schedule.

---

## Phase 5: Synthesis

Once ALL research agents are complete (or user decides to proceed with what's available):

1. **Launch the synthesis agent** (can be foreground or background depending on user preference)
2. The synthesis agent MUST:
   - Read ALL research agent output files
   - Identify cross-cutting themes, contradictions, and gaps
   - Produce a single coherent document with:
     - Executive summary (3-5 bullets)
     - Key findings organized by theme (not by agent)
     - Contradictions or tensions found across agents
     - Confidence assessment (what's well-supported vs. needs validation)
     - Recommended next steps
   - Write to the synthesis output file
   - Follow the same write protocol (write after every read, no two reads without a write)

3. **Report to user** when synthesis is complete with a brief summary of the key findings.

---

## Key Rules

1. **Never launch agents without user approval of the plan.**
2. **Every agent gets the critical write protocol verbatim.** This is non-negotiable.
3. **Monitor proactively.** Don't wait for the user to ask -- check in on schedule.
4. **Kill stuck agents immediately.** If an agent's line count hasn't changed between two consecutive check-ins, stop it with TaskStop and relaunch. Agents do NOT self-correct -- waiting is wasting time. See "Stuck Agent Recovery" in Phase 4.
5. **Keep check-in reports concise.** The user wants progress updates, not prose.
6. **Agents cannot run Bash.** They only have access to: WebSearch, WebFetch, Read, Write, Edit, Glob, Grep. Plan accordingly -- if research requires downloading/parsing PDFs, do that in the main session BEFORE launching agents and provide parsed file paths.
7. **Source integrity applies to all agents.** Every number needs an inline URL. No orphaned facts.
8. **403 errors cause research loops.** Agents that hit paywalled/blocked sites often spiral into repeated fetch attempts without writing. The write protocol explicitly addresses this: "Write what you have, THEN try another URL." If an agent is hitting 403s repeatedly, it's likely about to get stuck.
9. **Pre-load data on relaunch.** When relaunching a stuck agent, always extract useful data from its search results and include it in the new agent's prompt. This prevents re-researching the same ground and gets the agent writing immediately.
