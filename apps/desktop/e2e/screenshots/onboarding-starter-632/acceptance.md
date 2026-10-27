# Sample repair assessment — #632

2026-10-27. Base: `f62f86db926cc31f0d5aa3ed49345c239f057814`.

The Dashboard offers one disclosed sample after existing provider, memory and
welcome onboarding. The new `architect_projects sample_repair` action prepares
a product-owned fixture and uses existing Architect create/resume, access
approval and result services. No onboarding flow, IPC, runtime preference,
budget policy or published package changed.

## Acceptance evidence

| Criterion | Implementation and evidence | Remaining proof |
| --- | --- | --- |
| 1. Clear launch after provider setup | Dashboard card, gated on completed onboarding and a usable provider. Existing workspace execution, OpenSpec-off, profile model defaults and $5 start cap. [Disclosure](01-disclosure.png) observed in the running app; store tests cover gating and model changes. | End-to-end launch after the destination fix has not been rerun. |
| 2. Prerequisites, downloads and charges before execution | Disclosure lists Node/Git, selected runtime/image downloads, selected provider/model tiers, provider charges and the existing cap. Tool description also states preparation is unpaid and resume needs existing approval. | Clean-machine provisioning and real-provider behavior remain unproved. |
| 3. Real isolated file/shell repair | Product fixture is seeded once in a distinct managed workspace. Git commits the faulty source and existing test before project creation. Commands use the selected workspace runtime. Real-Git unit coverage proves the starting check fails, a repair passes, and Git retains its diff. | The integrated app repair was not reached; no real-provider run was made. |
| 4. Check, diff and open result | Reuses #631 result, recorded checks, Open Git changes and Open result. The single workflow spec exercises those actions through real services with a local scripted provider. | This attempt did not reach those assertions. #631's earlier evidence does not prove this new entry path. |
| 5. Stop and recovery | Existing project stop/resume remains authoritative. Setup failures show retry; provider management is available. Durable sample identity and serialized preparation preserve existing files/project on retry. Store tests prove reopening never resumes stopped work, and profile switching clears stale launch state. | Dependency retry and preservation have unit proof; integrated stop/provider recovery needs later app evidence. |
| 6. Clean packaged installation | Fixture strings ship inside the Architect runtime; Node/Git resolve through existing shared system-first toolchains. No developer fixture import, per-profile tool installation or manual dependency requirement. | **UNPROVED.** Development Electron is not a packaged install. Collect with the actual #635 candidate. |
| 7. Unfamiliar people | No people were recruited or messaged by this task. | **UNPROVED.** A few unfamiliar people must try the journey and important confusion must be fixed. Agents/tests do not satisfy this criterion. |

## One app attempt and bounded fix

`onboarding-starter.workflow.spec.ts`, workflow project, retries 0, ran once
with a disposable onboarded profile and local scripted model. It displayed the
disclosure, then failed preparing the workspace. The visible error was
`Workspace parent path must be under the user home directory`; see
[setup failure](02-setup-failure.png). The test waited for an approval that could
not appear and ended after 2.1 minutes. No repair, result or open checkpoint
completed. `stages.json` records only the disclosure.

The fixture helper uses a symlinked HOME with a canonical profile path. Passing
the profile app-data folder as a custom workspace parent hit the existing
lexical home guard; custom profiles outside HOME would also encounter it.
The fix uses the manager's existing default profile workspace destination,
passing no custom parent. A saved unique sample name recovers a workspace if a
crash loses the subsequent ID write. Once saved, its workspace ID is used; a
removed workspace is not silently recreated. `requireEmpty` remains true.
Focused tests require this default-destination contract and prove retry keeps
the baseline and project. No second app run was made.

## Validation

Every pnpm invocation used `PATH="/private/tmp/sero-v1-tools/bin:$PATH"` (native
12.5.1, existing frozen dependencies). No install or paid-model call was made.

| Check | Result |
| --- | --- |
| Focused desktop onboarding/Dashboard/store and mandatory tool inventory coverage | 5 files, 22 tests passed. The new action has a probe entry and owner refusal coverage. |
| Architect package suite, with loopback access | 82 files, 888 tests passed. |
| Desktop package suite, with loopback access | 526 files passed, 2 skipped; 3281 tests passed, 5 skipped. |
| Profile-switch/store follow-up | 1 file, 5 tests passed. |
| Destination fix and existing project-actions tests | 2 files, 55 tests passed. |
| Final root `pnpm typecheck` | 29/29 tasks passed, including renderer/main and test types. |
| Desktop build and Electron restage before app attempt | Passed. These precede the destination fix, which was typechecked and unit tested. |
| React Doctor, including staged new files | 100/100, 14 files scanned, no issues. |
| Repository layout, diff whitespace and source LOC | Passed; all changed source files at most 500 lines. |
| One workflow app journey | Failed at preparation as described above; not rerun. |

The first sample tests exposed Node's variable default test reporter. Preparation
now selects TAP explicitly to identify the expected initial fault; the agent's
normal check remains `node --test repair.test.cjs`. Initial typechecks caught
missing test-profile metadata and the fake host's optional-parent type; both
were corrected before the final green check.

Raw logs are under `/private/tmp/sero-v1-tools/632-logs/`, including the package
suites, focused checks, typechecks, build, React Doctor, runtime log, final
screenshot and captured record. No verbose generated logs are committed.

## Scope

End-user guidance is in `apps/docs-site/docs/guide/profiles-and-onboarding.md`;
the docs-site build passed as part of typecheck. No package version bump is
needed: only desktop and private Architect plugin source changed. Largest
changed source file is `extension/projects-tool.ts` (441 lines).

Do not mark #632 complete on this evidence. The integrated post-fix journey,
clean packaged install and unfamiliar-person trials remain outstanding.
#630's Room/restart integrated proof also remains outstanding and was not rerun.

## Review round 1: provision Node before the sample probe

The review found that a Host shell prepares Bash and exposes installed tool
directories, but does not install Node. Onboarding permits continuing while its
core-tool download is unfinished, so a sample could keep failing after a Node
download failure even when connectivity returned.

The sample now resolves its workspace runtime and calls the existing shared
`host.toolchains.ensure('node')` when execution is on Host. Every preparation
retry repeats that provisioning step before probing Node. Container execution
keeps its own runtime and image; it does not install host Node or switch to
Host. Git provisioning and the subsequent workspace commands are unchanged.

The focused check passed 3 files / 57 tests: sample preparation, host adapter,
and existing project actions. Coverage includes a failed Node download followed
by a successful retry on the same Git baseline/workspace, plus the Host versus
container provisioning boundary. Root typecheck passed 29/29 tasks. Layout,
diff whitespace and source LOC checks passed; changed production files are
`host.ts` (210 lines) and `sample-repair.ts` (82 lines).

Logs: `review1-focused.log` and `review1-typecheck.log` under the same temporary
log directory. No full suite, app journey or paid call was repeated. The
integrated, packaged-install and human acceptance gaps above remain unchanged.
