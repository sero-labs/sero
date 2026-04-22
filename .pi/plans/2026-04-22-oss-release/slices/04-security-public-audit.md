# OSS-0104 — Security / Public Audit

Status: Completed
Owner: Security/public audit lane only
Prompt: `./prompts/04-security-public-audit.md`
Allowed writes: This file only

## Executive summary
- The repo already documents a strong security story for the gateway, but some public docs still expose operational details that should be sanitized or reframed before OSS release.
- The gateway docs are explicit about token storage, localhost binding, and attack surface; that is good for honesty, but some examples still instruct users to print or grep secret-bearing files.
- Multiple docs reference profile-scoped state under `~/.sero-ui/` and per-profile `agent/` paths; these are accurate, but they are local-path leaks that should be generalized in public-facing docs where possible.
- The memory docs describe persistent logs, debug logs, and system-prompt injection with concrete filesystem locations; this is useful internally, but should be carefully reviewed for OSS wording and privacy expectations.
- Auth docs already acknowledge secure storage, base64 fallback history, and token files; the public story needs to clearly distinguish current behavior from legacy/fallback behavior.
- There is evidence of secret-safety hardening in code and tests, but the OSS audit lane should verify that public docs do not overpromise encryption, isolation, or token scoping beyond what is actually enforced.
- The main hygiene gaps are documentation-level: unsafe shell examples, local filesystem path exposure, and unclear statements about what data is persisted, where, and for how long.
- No code/config edits were made; this is discovery-only and the findings below are intended to feed sanitization and release decisions.

## Scope covered
- Security and hardening docs under `docs/security/`
- Public-facing architecture/product docs touching auth, storage, logs, profiles, memory, and local paths
- Electron feature docs and comments surfaced by repository search where they describe tokens, secrets, or filesystem state
- Relevant test fixtures and code comments only as evidence for current posture; no implementation changes

## Public-hygiene findings

| Path / surface | Finding | Severity | Evidence | Recommended later action |
| --- | --- | --- | --- | --- |
| `docs/security/gateway.md` | The verification checklist tells users to run `cat ~/.sero-ui/gateway-token` and grep logs for the full token. Even though the intent is testing, this normalizes handling raw secrets in examples. | Medium | Checklist includes `cat ~/.sero-ui/gateway-token`; token leakage test uses `grep "$TOKEN" /tmp/sero-electron.log`. | Rewrite examples to use masked output and emphasize never printing full secrets in docs. |
| `docs/security/gateway.md` | The doc explicitly says the gateway token should be treated like a root password and lists sensitive storage locations. That is honest, but too operationally detailed for a public OSS README-style security summary unless framed carefully. | Low | “Treat the gateway token like a root password”; secret table includes `~/.sero-ui/gateway-token`, `.env`, API keys. | Keep in security reference docs, but add a shorter public summary that avoids encouraging path spelunking. |
| `docs/sero.md` | Public vision doc states exact platform constraints and runtime modes, but does not currently surface privacy/storage boundaries. This can leave readers with an incomplete security picture. | Low | Vision doc describes containers, host mode, and “local-first execution,” but no data-retention/security caveats. | Add a short public privacy/security note or cross-link to the security reference. |
| `docs/features/memory.md` | The memory system doc exposes exact storage layout, injection behavior, debug log paths, and QMD index location. Useful internally, but it reveals more filesystem detail than a public OSS audience usually needs. | Medium | Lists `~/.sero-ui/workspaces/global/`, `memory/daily/YYYY-MM-DD.md`, `~/.sero-ui/debug/memory/`, and `agent/cache/qmd/index.sqlite`. | Sanitise public phrasing; keep only conceptual storage behavior unless a path is required for setup. |
| `docs/features/profiles.md` | The profiles doc exposes exact profile registry path, startup sequence, and custom storage location behavior. This is accurate, but it is a local-path map that should be minimized in public docs. | Medium | Mentions `~/.sero-ui/profiles.json`, `SERO_HOME`, `app.setPath('userData')`, and custom folders. | Trim path-heavy details in public-facing copies and keep them in setup/reference docs. |
| `docs/security/hardening-plan.md` and `docs/security/outstanding-hardening.md` | These docs are internally transparent about known risks, including gateway token scope, auth storage, and cost caps. That is good for trust, but the public release story must not read like unresolved insecurity if the items are already fixed elsewhere. | Medium | Triage tables call out “DEFERRED” items and remaining open findings. | Before publishing, reconcile with current code state and clearly distinguish fixed vs open issues. |
| `apps/desktop/electron/features/gateway/security/auth.ts` (surfaced via docs search) | The code logs a hint that reveals how to read the full gateway token (`cat <path>`). Even if not public docs, it is a release hygiene concern because it may surface in logs or examples. | Medium | Search hit shows `console.log(... full token: cat ${this.tokenPath})`. | Remove or replace any user-facing guidance that encourages printing secrets. |
| `apps/desktop/electron/features/container/tools/system-prompt.ts` | The system prompt includes `Always redirect stdout/stderr to a log file` and examples of writing logs to `/tmp/...`. That is operationally useful but may produce privacy-sensitive artifacts if not documented clearly. | Low | Examples include `/tmp/vite.log` and `/tmp/dev-server-...log`. | Document log retention/redaction expectations in public setup docs. |
| `apps/desktop/electron/features/container/registries/artifact-registry.ts` | Artifact handling explicitly tracks screenshots, logs, and evidence from agent sessions. Public docs should clarify what may be captured and who can access it. | Low | File comment: “tracks screenshots, logs, and evidence from agent sessions.” | Add a public privacy note about artifact collection and retention. |

## Secrets / local data / config posture findings

| Topic | Current state | Risk / gap | Required public documentation or fix |
| --- | --- | --- | --- |
| Gateway token storage | Token is stored on disk at a profile-local path, with file mode `0600` and constant-time comparison; docs describe it as a root-password equivalent. | Good baseline, but public docs should not overteach token handling or suggest unsafe inspection patterns. | Document that the token is secret, local-only by default, and should never be pasted into issues/screenshots. |
| API keys / `auth.json` | Docs state API keys are stored in `auth.json` under the agent dir, using secure storage when available. Search also surfaced explicit permission-hardening work in code/tests. | Public docs need to be careful not to imply universal encryption guarantees across all platforms/fallbacks. | Say exactly what is encrypted, where it lives, and what happens if secure storage is unavailable. |
| GitHub OAuth token | Stored in `~/.sero-ui/github-auth.json` via Electron `safeStorage`; legacy handling and tests indicate token file cleanup and recovery behavior. | Readers may assume full keychain-backed safety without nuance. | Clarify the secure-storage dependency and whether any fallback path exists or is blocked. |
| `.env` loading | Docs say profile-local `.env` is loaded from the agent directory and may include secrets like provider credentials. | This is accurate but can be read as an endorsement to place any secret in plaintext config. | Public docs should clearly separate developer convenience from recommended secret management. |
| Profile-scoped state | Profiles isolate workspaces, sessions, auth, settings, layout, skills, prompts, browser data, and `.env`. | Good isolation story, but public docs expose exact paths and may overstate isolation if multiple profiles share the same machine user context. | Add a concise privacy statement: isolated by profile directory, not a hardened multi-user security boundary. |
| Memory and daily logs | Memory docs show persistent markdown storage plus daily logs and debug logs under the profile. | Risk of implying logs are ephemeral or private by default when they may contain prompt/tool content. | Publish explicit retention/privacy guidance for memory, daily logs, and debug logs. |
| Gateway/web chat example commands | Verification docs use direct shell commands against localhost ports and files. | Fine for internal docs; too sharp for public quickstarts because they normalize secret inspection. | Move intrusive security checks into a separate admin-only page or mask sensitive output. |
| Local-path references (`~/.sero-ui`, `/tmp`) | Many docs and tests encode exact host paths. | Good for implementation, but excessive in public OSS release materials. | Generalize where possible to “profile directory” / “temporary log location” and keep exact paths in setup docs only. |

## Sanitization priorities
1. Remove or mask any doc examples that print full secrets, tokens, or raw auth files.
2. Reword path-heavy public docs so they explain storage concepts without overexposing local filesystem layout.
3. Add a concise privacy/security summary that tells users what persists, what may be logged, and what stays local.
4. Reconcile “known limitations” sections with current code so public docs distinguish historical debt from present behavior.
5. Ensure release-facing docs do not imply stronger encryption/isolation guarantees than the app actually enforces.

## Recommended G1 decisions
1. Approve a public-doc sanitization pass before OSS release; this is release hygiene, not a product blocker.
2. Keep the detailed security reference docs, but create shorter public-facing summaries where the current docs are too operational.
3. Require a clear statement that profile isolation is directory-based and not equivalent to multi-user OS sandboxing.
4. Require a user-facing privacy note for memory, logs, and artifact capture.
5. Do not publish examples that instruct readers to print raw token files or grep logs for secrets.

## Blockers / open questions
- Which docs are intended to be public-facing at OSS alpha launch versus internal-only reference material?
- Do we want a single public security page, or should the current `docs/security/*` content remain as detailed operator docs with a separate sanitized README summary?
- Are any of the path-heavy docs required verbatim for installation, or can they be rewritten to use abstract placeholders?
- Should the release story explicitly mention any legacy/base64 or fallback secret-handling behavior, or is that now fully removed from public relevance?
