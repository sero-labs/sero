## Proof moment

Install a verified Loop Catalog entry, review the adapted draft, activate it, then show the loop armed or running from an event or schedule and producing a delivery receipt. This hits "that is not just a chat UI" because the agent is installed as a reusable loop that reacts to events, schedules, and delivery targets. It also hits "the workspace extends itself" because catalogue entries are fetched, validated, adapted to the workspace, versioned, and updated like product capabilities rather than pasted prompts. PR: https://github.com/sero-labs/sero/pull/226

## Draft X post

Sero now lets developers install agent workflows instead of rebuilding the same prompt every week.

The Orchestrator Loop Catalog ships reusable loops that can be adapted, activated, triggered, and verified inside the product.

[video]

- The Loop Catalog can install a verified loop definition, validate it like a library load, and create a draft that the planner adapts to the current workspace before activation.
- Living loops can arm on events from internal loop events, filesystem changes, local webhooks, or GitHub polling, with event-only loops waiting for the first matching event instead of spending an eventless run.
- Delivery targets are explicit: PR, workspace files, saved report, email draft/send, chat post, and webhook POST each require a receipt contract that Orchestrator verifies or repairs.

https://github.com/sero-labs/sero

If a local-first workplace for AI agents sounds useful, starring the repo genuinely helps more developers find it.

## 60-second demo script

1. Open Sero to Orchestrator and switch to the Loop Catalog. Show the official verified catalogue source and the list of available loops. Run for about 8 seconds.
2. Choose one catalogue loop that is safe to record locally, such as a saved-report or daily-note workflow, and click install. Show the install validation completing and the new draft opening rather than auto-activating. Run for about 10 seconds.
3. Review the adapted draft in the Orchestrator UI: show its trigger, step plan, and delivery target. If the planner asks a setup question, answer it in the product and show the draft updating. Run for about 12 seconds.
4. Activate the loop and show it armed. If it is event-triggered, fire the real local event or webhook it listens for; if it is schedule-based, use the product control that starts the next run. Run for about 10 seconds.
5. Watch the loop run and keep the delivery section visible until a receipt appears, such as a saved report path, workspace-file receipt, or PR receipt depending on the loop selected. Run for about 14 seconds.
6. End on the loop detail page showing the active loop, its catalogue provenance or version state, and the delivery receipt that proves where the result went. Run for about 6 seconds.
