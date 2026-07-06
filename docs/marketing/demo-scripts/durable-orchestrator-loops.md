# Durable Orchestrator loops 60-second demo

## Hook

I asked Sero to turn a one-off request into a loop that can stop, ask, recover, and finish later.

## Shot list

| Time | Shot | Must be visible | Spoken/caption line |
|---|---|---|---|
| 0:00–0:06 | Open the Orchestrator panel on Home. The cursor lands on **New loop**. | **Sero Orchestrator** header; **Home**, **New**, **Library**, **Reflect all**; **Needs you**; **Loops overview**; **New loop** button. | “This is Sero Orchestrator: agent work that can keep state.” |
| 0:06–0:13 | Click **New loop**. Type a plain-English request into the wizard. Toggle/check the safe worktree setting and open the delivery picker. | New loop wizard; **Describe what you want done** textarea; optional title; safety card with **Run in a managed worktree (its own branch)**; **Deliver results to** picker. | “I describe the job, choose a safe worktree, and choose where results go.” |
| 0:13–0:18 | Click **Generate plan →**. If generation is slow, show a short timelapse over the loading state. | **Generate plan →**; **The AI is writing the plan…**. If needed: Clarify screen with **The planner needs a few answers first** and **Submit answers & build the plan**. | “Sero turns the request into a plan, not just a chat reply.” |
| 0:18–0:27 | Review the generated plan. Scroll just enough to show the spine, parallel/branch rows if present, and one step’s tuning controls. | **Here’s the plan the AI wrote**; **LoopMetaStrip**; **PlanView** vertical spine; **StepCard**; objective; step title; execution type; status; expected outcome; **Tune** model/tools controls. | “Before anything runs, I can inspect the exact steps and tools.” |
| 0:27–0:33 | Hold on the approval moment. Cursor hovers over **Save as draft**, then clicks **Activate loop →**. | Review stage; generated plan still visible; **Save as draft**; **Activate loop →** or **Activate**. | “This click is the approval. Without it, the loop stays a draft.” |
| 0:33–0:41 | Loop detail opens and runs. Show live status changing, then timelapse if needed. | Loop detail view; title/summary; status badge; **LoopMetaStrip**; **Run next**, **Disable**, **Delivery**, **Context**, **Library save** controls; **LiveActivityStrip** with **Running**, current step title, elapsed time, tokens, cost. | “Now it runs as a durable loop, with time, cost, and current work visible.” |
| 0:41–0:49 | A paused step asks for approval or input. Show the full card, attached draft if present, and approve/reject choices. Click the answer button. | **InputRequestCard**; **Needs your input**; prompt; attached draft content if present; **Approve** / **Reject** choices or free-text box; **Send answer & continue**. | “External sends and human decisions stop here until I approve them.” |
| 0:49–0:55 | Show recovery path. A prepared blocked/failing step is selected; click **Retry step** or show **Restart** in controls. | Block notice; affected **StepCard** with problem outcome; **Retry step** button; **Restart** in LoopControls if blocked/disabled. | “If a step blocks, the loop records the problem and gives me a retry path.” |
| 0:55–1:00 | End on finished state and history. | Completion card: **Completion (complete): …**; **Attempt history** with run status, time, tokens, cost, and delivery receipt badge if applicable. | “The run ends with a completion record and an audit trail.” |

## Honest caveats

- Plan generation is model-dependent; if it is slow, label the edit “AI writes the plan — sped up”, with the real duration if known.
- A real loop run can take seconds to minutes depending on model and tool speed; label any run timelapse with the actual duration.
- Use a manual, webhook, or file-triggered loop for filming. GitHub event loops poll gently, every 2 minutes by default and never faster than 1 minute.
- Recovery is easiest to film with a prepared blocked state; otherwise show the built-in blocked UI and **Retry step** path as the recovery surface.
- Sero is public beta. Loops are useful local automation, not a guaranteed job runner.
- Creating and running plans requires a working model login/provider.
- Managed worktrees and PR delivery require a git workspace; PR delivery also needs `gh`/GitHub setup.
- Email send approval requires the Google plugin; chat post approval requires a connected MCP chat server; GitHub event triggers use `gh` login.
- External sends require approval every time. Rejecting sends nothing.
- Orchestrator adds persistence, scheduling, locks, limits, recovery, and history, but step work still uses standard Sero agents, tools, approvals, and policies.
- Loop state is stored under `<workspace>/.sero/apps/orchestrator/`; library/catalog state is profile-shared/cache-backed.
