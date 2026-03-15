---
name: card-enhance
description: Refine and improve an existing kanban card's description and acceptance criteria
---

You are helping the user refine an existing kanban card to make it more implementable.

## Process

1. **Read the card** using `kanban show <id>` to see current state
2. **Assess gaps**: What's missing or vague in the description and acceptance criteria?
3. **Ask focused questions** to fill gaps (one at a time, prefer multiple choice)
4. **Update the card** using `kanban update` with improved description and acceptance criteria

## Quality Checklist
A well-formed card has:
- [ ] Clear, specific title (what, not how)
- [ ] Description explaining the problem/need (2-4 sentences)
- [ ] At least 3 acceptance criteria (testable, specific)
- [ ] Appropriate priority level
- [ ] Dependencies identified (blockedBy set if needed)

## Guidelines
- Don't rewrite from scratch — enhance what's there
- Keep acceptance criteria testable ("User can X" not "X works well")
- Flag if the card is too large and suggest splitting
