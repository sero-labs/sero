# Draft: GitHub repo About box for sero-labs/sero

Status: DRAFT — do not apply until Dan approves. Commands below mutate GitHub.

## 1. Current state

Verified 2026-07-06 with:

```bash
gh repo view sero-labs/sero --json description,homepageUrl,repositoryTopics
```

Result: `{"description":"","homepageUrl":"","repositoryTopics":null}` — everything is empty.

## 2. Proposed description

> Local-first desktop workspace for AI agents: browser, terminal, memory, plugins, runtimes, and durable loops.

(108 characters — well under GitHub's ~350 char limit. Taken verbatim from the growth strategy.)

## 3. Proposed website

https://sero-ai.dev/

## 4. Proposed topics

All 12 from the strategy. Each validated against GitHub topic rules (lowercase, letters/numbers/hyphens only, ≤35 chars, max 20 topics per repo):

`ai`, `ai-agent`, `coding-agent`, `agent-workspace`, `local-first`, `desktop-app`, `electron`, `typescript`, `open-source`, `pi-agent`, `developer-tools`, `automation`

## 5. Apply commands (run only after approval)

```bash
gh api -X PATCH repos/sero-labs/sero \
  -f description='Local-first desktop workspace for AI agents: browser, terminal, memory, plugins, runtimes, and durable loops.' \
  -f homepage='https://sero-ai.dev/'
```

```bash
gh api -X PUT repos/sero-labs/sero/topics \
  -f 'names[]=ai' \
  -f 'names[]=ai-agent' \
  -f 'names[]=coding-agent' \
  -f 'names[]=agent-workspace' \
  -f 'names[]=local-first' \
  -f 'names[]=desktop-app' \
  -f 'names[]=electron' \
  -f 'names[]=typescript' \
  -f 'names[]=open-source' \
  -f 'names[]=pi-agent' \
  -f 'names[]=developer-tools' \
  -f 'names[]=automation'
```

Note: the topics endpoint replaces the full set (PUT). No preview header needed on the current API.

## 6. Verify

```bash
gh repo view sero-labs/sero --json description,homepageUrl,repositoryTopics
```
