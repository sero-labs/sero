# Changelog

All notable changes to Sero will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and beta release tags use a SemVer prerelease form.


## [0.5.0-beta.0](https://github.com/sero-labs/sero/compare/v0.4.0-beta.0...v0.5.0-beta.0) (2026-07-10)

### Features

* **app-runtime:** expose workspace.list() to plugin background runtimes ([3010896](https://github.com/sero-labs/sero/commit/3010896391fc7243ecda9f3df73900d2db6efdff))
* **app-runtime:** machine-shared app-tools dir for plugin runtimes ([34c1823](https://github.com/sero-labs/sero/commit/34c18238c9530a4e468b014bc14518bd4c6a31d5))
* **app-runtime:** provider credentials capability for background runtimes ([52ba000](https://github.com/sero-labs/sero/commit/52ba000ad603a701e9f00372aae8eabdb5dea52b))
* **app-runtime:** toolchains.ensure capability for background runtimes ([e7eeae5](https://github.com/sero-labs/sero/commit/e7eeae590125159c8632620446d4e0dbee518130))
* **common:** add platformTools, signal, and result metadata to subagent runtime contract ([0fe7009](https://github.com/sero-labs/sero/commit/0fe70090b88a2879fc0212b7c8af48ef5719eca8))
* **common:** canonical workspace ignore list, de-duplicating gitignore bootstrap and worktree hygiene ([16e2c13](https://github.com/sero-labs/sero/commit/16e2c13b5b2ef399a90f129120a3f5f7956e2bd9))
* **debug:** filter streaming delta events from model-messages log ([45b2c5d](https://github.com/sero-labs/sero/commit/45b2c5d38d8b2b2f8191a368c22ff4c9a0345273))
* **desktop:** cross-platform app chrome with zoom, navigation, and shortcuts ([#233](https://github.com/sero-labs/sero/issues/233)) ([f427336](https://github.com/sero-labs/sero/commit/f4273364785b2cb28f07f10ff83b6961195a9792))
* **desktop:** publish Linux AppImage alongside the .deb ([#236](https://github.com/sero-labs/sero/issues/236)) ([79ab206](https://github.com/sero-labs/sero/commit/79ab20647b3b22461a4f7be1c5b1cb9df8fa1008)), closes [#228](https://github.com/sero-labs/sero/issues/228)
* **desktop:** surface background-job questions when the chat panel is closed ([7f8ad30](https://github.com/sero-labs/sero/commit/7f8ad30d8eccd8ae5349864ce1caf9dc00dd90f6))
* **graphify:** agent tools — search/query/path/explain/status/index ([c77e97b](https://github.com/sero-labs/sero/commit/c77e97b9a342acf656f6e6c52db2a6d09f2d66a2))
* **graphify:** auto-context — session orientation and intent-aware hints ([09d66e5](https://github.com/sero-labs/sero/commit/09d66e5ed452a7cad3b5383929dca4c9f591e806))
* **graphify:** background runtime wiring (provisioning, indexing, merging) ([14d892e](https://github.com/sero-labs/sero/commit/14d892e8ed6f0f3b90779ba9c990932735cd2011))
* **graphify:** bounded exec for host-side graphify invocations ([5d9105f](https://github.com/sero-labs/sero/commit/5d9105fe3046e7db2c365c8b93d4b3d781772040))
* **graphify:** graph.json loader with size caps and tolerant parsing ([f03c194](https://github.com/sero-labs/sero/commit/f03c194adba296e3ba2580c234c52bb1fc27f97a))
* **graphify:** graphify runner with stat parsing and backend credential env ([03968cd](https://github.com/sero-labs/sero/commit/03968cde58fc496e0f54060e2eb4249f4eadf35f))
* **graphify:** graphifyy provisioner via managed uv ([62d3d9d](https://github.com/sero-labs/sero/commit/62d3d9d5b9dc0aa6a4fd923faef7e624089e2a25))
* **graphify:** indexer orchestrator with single-flight queue and profile merge ([73d8ade](https://github.com/sero-labs/sero/commit/73d8adec6b4098773ffc65eaa3700542692475ba))
* **graphify:** management UI panel with profile-wide search ([daaea1b](https://github.com/sero-labs/sero/commit/daaea1be0989b6b38e87f9344aca2702c1f52529))
* **graphify:** push-based updates and discovery — no polling ([381d810](https://github.com/sero-labs/sero/commit/381d81045e95bc0fc6b8758f62d5eaed4d7911be))
* **graphify:** render query results with human labels and provenance ([ed1f4dd](https://github.com/sero-labs/sero/commit/ed1f4dd67ab3a330ad6655b3fcc703528b404195))
* **graphify:** runtime hardening from live E2E ([c13c013](https://github.com/sero-labs/sero/commit/c13c013f03dea903b997507fdba91fd6a13a2f78))
* **graphify:** scaffold sero-graphify-plugin with state shape and path resolution ([878cc9d](https://github.com/sero-labs/sero/commit/878cc9dd36e037f066e60c0f1139c9a659cd03ff))
* **graphify:** TypeScript graph query engine (query/path/explain) ([54f3692](https://github.com/sero-labs/sero/commit/54f36925eb97cb8330e0ecf31c99be1da17b3b3f))
* improvements from development of sero factory plugin ([da61eda](https://github.com/sero-labs/sero/commit/da61eda82f7b8411b27c665c996241747b43b015))
* **loom:** agent-authored GLSL shader studio for Sero ([#215](https://github.com/sero-labs/sero/issues/215)) ([f9a2c30](https://github.com/sero-labs/sero/commit/f9a2c30ffaa8ad6084e92bc64d7985173466cb1c))
* **orchestrator:** "Start over" — re-run any loop from the first step ([d05624b](https://github.com/sero-labs/sero/commit/d05624b56674211a2765353743d9ca49b637bdaa))
* **orchestrator:** active-session execution via new host.session seam ([afcab18](https://github.com/sero-labs/sero/commit/afcab18b8cf0b39dbecb651aa8c8698fc7428e3a))
* **orchestrator:** add Loop Library — save/load loops across workspaces with versioning ([ebde0de](https://github.com/sero-labs/sero/commit/ebde0de28cecbfdea3ababf8328b3ee7417a7851))
* **orchestrator:** always include the lean baseline in every step's tools ([91ff0b3](https://github.com/sero-labs/sero/commit/91ff0b3fe678b299e279c23b4eb3af736d7b46fd))
* **orchestrator:** branch-source control and event-queue visibility (spec 15 phase 6) ([869c79f](https://github.com/sero-labs/sero/commit/869c79fdd73187805024a4aee041743ddad72306))
* **orchestrator:** branching engine + schema (phase 1) ([11db2ef](https://github.com/sero-labs/sero/commit/11db2ef53fe25fbfd23555a489622b09bd00ecf4))
* **orchestrator:** coordinator run engine, locks, artifacts, reconcile ([3a5c1ef](https://github.com/sero-labs/sero/commit/3a5c1efe8fd5cdbe6bfb053784708b14f0a3d4da))
* **orchestrator:** cron/event/hybrid scheduling with closed-workspace catch-up ([c7d00d3](https://github.com/sero-labs/sero/commit/c7d00d340aebd58aacbc9572ace2ea066204ba14))
* **orchestrator:** event-pr branch resolution (spec 15 phase 4, FR-P1) ([7b34a21](https://github.com/sero-labs/sero/commit/7b34a21622b6ef3d8f04105490ad4ebd3584e1c3))
* **orchestrator:** existing-branch worktree seam (spec 15 phase 3, FR-P2) ([5f44107](https://github.com/sero-labs/sero/commit/5f44107dcc05cef56a3e7174268a3d4eb50ce447))
* **orchestrator:** home search/pagination + outcome notifications (RR-1–RR-3) ([83f02ba](https://github.com/sero-labs/sero/commit/83f02ba1a13cbf1208ba36dbe5f41c267ced1b63))
* **orchestrator:** human input — steps and the planner can ask the user ([bb6f023](https://github.com/sero-labs/sero/commit/bb6f02372d8d8ec796012b30b66451304851cb03))
* **orchestrator:** living loops phase 1 — event engine core ([48a7043](https://github.com/sero-labs/sero/commit/48a70434e4a4df8219a4009cc3560ab911df01fb))
* **orchestrator:** living loops phase 2 — source manager and internal loop events ([bac2caa](https://github.com/sero-labs/sero/commit/bac2caa4632bf8afeada521606e5b7929e7e6aa3))
* **orchestrator:** living loops phase 3 — filesystem and webhook adapters ([7937e8b](https://github.com/sero-labs/sero/commit/7937e8bdd135d6bd24afd0928d58fc07a1010951))
* **orchestrator:** living loops phase 4 — GitHub polling adapter ([389d773](https://github.com/sero-labs/sero/commit/389d773de630c44247207c15c1537cf64a10e069))
* **orchestrator:** living loops phase 5 — trigger authoring, UI, and docs ([ea4855e](https://github.com/sero-labs/sero/commit/ea4855e29d376a296db5122536e24136428dcd1b))
* **orchestrator:** LLM outcome evaluation, recovery, and completion signals ([1bbbb41](https://github.com/sero-labs/sero/commit/1bbbb41b3e1ae07ba4c0d7a099aa9b6d3d3dcfa8))
* **orchestrator:** loop catalog phase 1 — repo store, cache, on-demand fetch ([fd14fcd](https://github.com/sero-labs/sero/commit/fd14fcd9acca019ba041127d8ea3378408566fad))
* **orchestrator:** loop catalog phase 2 — install flow, provenance versions, adaptation ([ae78b9a](https://github.com/sero-labs/sero/commit/ae78b9ae58abdce6bbf7927071b727253e372e19))
* **orchestrator:** loop catalog phase 3 — updates via refresh, fail-soft guarantees ([612cdff](https://github.com/sero-labs/sero/commit/612cdff295ea95f346575198ed1f81e29229ff2c))
* **orchestrator:** loop catalog phase 4 — Catalog tab, repo management, docs ([2c1aaf3](https://github.com/sero-labs/sero/commit/2c1aaf3be68f741ffe64c98ea1d93796aced00c3))
* **orchestrator:** loop catalog phase 5 — official example loops authored and shipped ([cdb6a94](https://github.com/sero-labs/sero/commit/cdb6a94a89a9b53ff96d70509c34c615a0f1f332))
* **orchestrator:** loop catalog phase 6 — e2e verification in the real app ([f2aab8b](https://github.com/sero-labs/sero/commit/f2aab8b66a6313caa3e80e209505675daea9f07c))
* **orchestrator:** on-demand loop reflection (self-improvement) ([5bb6069](https://github.com/sero-labs/sero/commit/5bb606923840b109d9c732196043ed550c8f4b61))
* **orchestrator:** pending-event FIFO queue (spec 15 phase 1, FR-P3) ([3f752c6](https://github.com/sero-labs/sero/commit/3f752c67ce68c7fcaa0e7e3f0c5f9f772e1434b6)), closes [source#dedupeKey](https://github.com/sero-labs/source/issues/dedupeKey)
* **orchestrator:** per-loop context override ([75ad1eb](https://github.com/sero-labs/sero/commit/75ad1ebf7287a037eaaa3d25b17a34885fd197e3))
* **orchestrator:** per-loop usage/budget + UI logic tests + docs refresh (RR-4–RR-7) ([101d074](https://github.com/sero-labs/sero/commit/101d074e30d48af76bbb5feb1b22f730d757f21e))
* **orchestrator:** per-run stats in a collapsible section on run cards ([7a2b9e4](https://github.com/sero-labs/sero/commit/7a2b9e444d7157a97fa1c9bcd4253be0961f4193))
* **orchestrator:** per-step model tier selection with MED fallback ([d439847](https://github.com/sero-labs/sero/commit/d43984714f830f305150bb0bb3a73fcbc0a0e8fa))
* **orchestrator:** per-step Retry on the blocked step; drop loop-level Retry ([ef811b4](https://github.com/sero-labs/sero/commit/ef811b4473f1da312963143e602c08e31a65df40))
* **orchestrator:** per-step subagent (agent role) — planner-picked or user-set (spec 11) ([e990599](https://github.com/sero-labs/sero/commit/e990599b1c8b5bee949c34d014e97c06ae090730))
* **orchestrator:** per-step tool selection ([f641e9c](https://github.com/sero-labs/sero/commit/f641e9c8ad0103161821b081d411690d1c52c438))
* **orchestrator:** pluggable delivery phase 1 — delivery as a loop setting ([b765444](https://github.com/sero-labs/sero/commit/b765444645ad53d8c66652d4e71b7e54d67c71b6))
* **orchestrator:** pluggable delivery phase 2 — destination registry + planner rules ([df0cb5b](https://github.com/sero-labs/sero/commit/df0cb5bc503c021a24b66219eebb7940239ca847))
* **orchestrator:** pluggable delivery phase 3 — enforced receipts, persistence, verify-back ([709cbdc](https://github.com/sero-labs/sero/commit/709cbdc02f21274abf01c262292628baeb60dc4d))
* **orchestrator:** pluggable delivery phase 4 — mechanical external approval gate ([535b130](https://github.com/sero-labs/sero/commit/535b130eb13b8f53909faf5eb376c5686a60e692))
* **orchestrator:** pluggable delivery phase 5 — availability warning, UI, docs ([fa246de](https://github.com/sero-labs/sero/commit/fa246de9ad361f933da7a4dca7b09765e53c69f5))
* **orchestrator:** pluggable delivery phase 6 — e2e verification in the real app ([e17590e](https://github.com/sero-labs/sero/commit/e17590e3cbdb57553465740c5f7adf09e5d31fbb))
* **orchestrator:** plugin shell, state, coordinator registry, tools, and UI ([07ab7af](https://github.com/sero-labs/sero/commit/07ab7af1c40546d74df12320181a87bb973d5ac2))
* **orchestrator:** PR awareness and tracking for loops ([a5535cf](https://github.com/sero-labs/sero/commit/a5535cffeaad01ee4d6177de8d350e57d84710c4))
* **orchestrator:** PR lifecycle catalog recipes and docs (spec 15 phases 7-8) ([1455284](https://github.com/sero-labs/sero/commit/14552840d581124967da048b47099639a535e043))
* **orchestrator:** pr-approved, main-updated, issue-opened event kinds (spec 15 phase 2, FR-P4) ([e84b208](https://github.com/sero-labs/sero/commit/e84b20813186de4b8cbb1c7ddd36193e61fd300e))
* **orchestrator:** prompt-to-plan planning with structural validation ([064e144](https://github.com/sero-labs/sero/commit/064e1442b7d54640528dcffae22e12650b783ec8))
* **orchestrator:** recurring-loop lifecycle, kill-able runs, split persistence ([a865621](https://github.com/sero-labs/sero/commit/a86562118382025e4ee03290823de2a8f2d8e82a))
* **orchestrator:** rename 'Start over' button to 'Restart' ([ce9ad81](https://github.com/sero-labs/sero/commit/ce9ad815f815e1ca1bda5b8617d7d3a7ede63127))
* **orchestrator:** retry a blocked/stuck loop from the UI ([d367a6d](https://github.com/sero-labs/sero/commit/d367a6dbd9c88075576d1981a76040b48e60db51))
* **orchestrator:** richer home overview — progress bars + attention cards ([d9bde40](https://github.com/sero-labs/sero/commit/d9bde402a9d111ee3d65a663b4f10db993f5d5ea))
* **orchestrator:** run-in-dirty-workspace-root override for loops ([3ed6201](https://github.com/sero-labs/sero/commit/3ed6201286281b169c7b6dbadd4ff8579f5bc1f7))
* **orchestrator:** show branches in the plan view (phase 3) ([f187b12](https://github.com/sero-labs/sero/commit/f187b124f53a8b2faca55e40c6f13bf384bbd07c))
* **orchestrator:** step execution, workspace isolation, and limits ([9441452](https://github.com/sero-labs/sero/commit/9441452f0718dfa680124ed49344401239e06c71))
* **orchestrator:** surface library divergence + loop-list update badge ([a7a9c95](https://github.com/sero-labs/sero/commit/a7a9c95efea20647319368a68fbef2a6b685a887))
* **orchestrator:** teach the planner to author branches (phase 2) ([9ed23d1](https://github.com/sero-labs/sero/commit/9ed23d11cfc91b0f752a634cccb1795929020cec))
* **orchestrator:** thread real run cost from the pi session into run stats ([632dae9](https://github.com/sero-labs/sero/commit/632dae9e087e610f93459930178a77edeca0528f))
* **orchestrator:** updated-PR receipts and push-not-open planner rules (spec 15 phase 5, FR-P5) ([5748fac](https://github.com/sero-labs/sero/commit/5748fac39976463f8b89d0d2bac6fddc0037579c))
* **orchestrator:** wireframe-aligned UI — home inbox, calm detail, plan spine, guided create ([d84885e](https://github.com/sero-labs/sero/commit/d84885ef34dc205d48dfb6229eeb7a40e4a84dcd))
* **subagent:** external AbortSignal on structured runs, abort-aware concurrency pool ([797947e](https://github.com/sero-labs/sero/commit/797947e0c02e216cb6ba6ea300baf46132ff9083))
* **subagent:** forward reasoning deltas into the live-output channel ([822c10e](https://github.com/sero-labs/sero/commit/822c10e94692d2ca32b526406b759f43e4d8c410))
* **subagent:** platform-tool policy with session allowlist enforcement ([2c15858](https://github.com/sero-labs/sero/commit/2c158584f5d4d57684a0761ca0a9f476831b9fd3))
* **subagent:** return model identity, duration, and usage from structured subagent runs ([43135ac](https://github.com/sero-labs/sero/commit/43135ac47a90934f99cb9c7e1fc05afaf9f90c0d))
* **toolchain:** add uv as an on-demand managed tool ([acf1816](https://github.com/sero-labs/sero/commit/acf18162fd0fd0eeee614b7dbdf6cadfb4105e3f))
* **workspace:** expose access roots for plugin context ([0bcb250](https://github.com/sero-labs/sero/commit/0bcb25007a955e5f6e9c096cb13e23495e3be050))

### Bug Fixes

* **build-plugin:** exclude test files from shipped plugin bundles ([ccf8a6d](https://github.com/sero-labs/sero/commit/ccf8a6d45cd236da554236479e455d7ad818128d))
* **desktop:** align macOS traffic lights ([168b610](https://github.com/sero-labs/sero/commit/168b61040d25c963f0505202609c0ef010813741))
* **graphify:** auto-context fires strictly in indexed workspaces ([2d13561](https://github.com/sero-labs/sero/commit/2d13561b7d62afad9fa2915df3a0f289fff485c1))
* **graphify:** discover new workspaces live instead of only at runtime start ([6abc5a1](https://github.com/sero-labs/sero/commit/6abc5a11ad0daddfaa94f94c89eb4980c5a9130b))
* **graphify:** install graphifyy with backend SDK extras and self-repair marker ([d23a6d5](https://github.com/sero-labs/sero/commit/d23a6d5c3ca555d6bcb9c70cfb3db8463dc0f697))
* **graphify:** stop extract writing its cache into the workspace ([57ac09f](https://github.com/sero-labs/sero/commit/57ac09f578e619a89f8bee89e1990214a90d0414))
* **graphify:** support managed uv on Windows ([64b5786](https://github.com/sero-labs/sero/commit/64b57861a8e578ca6199a48c69d16d4d83ee9086))
* **homepage:** improve graphify feature copy ([39bc501](https://github.com/sero-labs/sero/commit/39bc5017ddd67d1734adeb0d285de6539b0f035a))
* multiple manual testing fixes ([a92b2b6](https://github.com/sero-labs/sero/commit/a92b2b67a7ebac87b8546e2a753ed4920507a898))
* **orchestration:** show full tool command, truncate to fit with hover tooltip ([a98a0b7](https://github.com/sero-labs/sero/commit/a98a0b7923ef567b2a9ea26d3f2bfff78885f1cb))
* **orchestrator:** accept a plain string-array plan from the model ([fd24332](https://github.com/sero-labs/sero/commit/fd243327600a1d8655d35463d4782c11105b1dfa))
* **orchestrator:** address PR [#224](https://github.com/sero-labs/sero/issues/224) review — containment, cancellation & turn safety ([7e82084](https://github.com/sero-labs/sero/commit/7e8208490ebfe48b9efb8b6d6e8ff9a7f760e647))
* **orchestrator:** bind external-send approval to an explicit consumable token ([bedf3fa](https://github.com/sero-labs/sero/commit/bedf3fa5c9325a7ff46b128c5e04e7c82be52bd1)), closes [#226](https://github.com/sero-labs/sero/issues/226)
* **orchestrator:** enforce routing/completion/human-input contracts and per-run worktrees ([12346a4](https://github.com/sero-labs/sero/commit/12346a478c41f3562e1b61c3ad982491ac77d68b))
* **orchestrator:** event loops must outlive their runs ([a21917b](https://github.com/sero-labs/sero/commit/a21917bc49626c8e469fd1f16070589c4790fc5f))
* **orchestrator:** event-only loops arm at activation instead of running an eventless pass ([d29c219](https://github.com/sero-labs/sero/commit/d29c219ecb108b0655669d425a2f4bf65cb1cec1))
* **orchestrator:** event-pr branch resolution is source-aware ([2470844](https://github.com/sero-labs/sero/commit/2470844be2a76d04f138737215ce11526e300396))
* **orchestrator:** file-delivering definitions instantiate at the workspace root ([7ddd0fe](https://github.com/sero-labs/sero/commit/7ddd0feba84b9868b084e424ced067c9484e5d7d))
* **orchestrator:** library version switch applies the full definition, not just the plan ([eebb645](https://github.com/sero-labs/sero/commit/eebb6455d27a15aa06ee4715732e559644d431c6)), closes [#226](https://github.com/sero-labs/sero/issues/226)
* **orchestrator:** planner owns finalize + delivery so the user only states the goal ([82626fc](https://github.com/sero-labs/sero/commit/82626fc5ef75e354aa9bfb512cdb529de92b50b5))
* **orchestrator:** required delivery params — block at activation, inject into step prompts ([1dcb66f](https://github.com/sero-labs/sero/commit/1dcb66f5b41b65b8d00e8c6d09f39c0d006259b1))
* **orchestrator:** Retry must restore a step's attempt budget ([83ce5bd](https://github.com/sero-labs/sero/commit/83ce5bdadf65ec0d7d69183edeee71cc48265755))
* **orchestrator:** share coordinator registry via globalThis; survive legacy state ([16780d0](https://github.com/sero-labs/sero/commit/16780d0b73d100f877ca82d849604315e5f7ca51))
* **orchestrator:** step agents must not delete prior steps' untracked work ([3adbd16](https://github.com/sero-labs/sero/commit/3adbd16e8d7076ea36b0aba072be4d7dc9f04c4b))
* **orchestrator:** strip baseline names from planner-set step tools ([e5f5228](https://github.com/sero-labs/sero/commit/e5f522834c2f648d9b05d8d869c5f70eefa070e1))
* **orchestrator:** time out active-session step promptly when wall-clock budget is exhausted ([9d6283c](https://github.com/sero-labs/sero/commit/9d6283ca14996043b6fea81be451e11078d13587))
* **orchestrator:** tolerate real-model plan shapes; retain raw planner reply ([19d945d](https://github.com/sero-labs/sero/commit/19d945d2fd195a9f3d8e1a422dcb7d7690e15810))
* **orchestrator:** validate the full shared definition — triggers included — on catalog and library entry points ([d60e9cb](https://github.com/sero-labs/sero/commit/d60e9cbdd368c726b5661f12c5fd0ae72cd1781e)), closes [#226](https://github.com/sero-labs/sero/issues/226)
* **orchestrator:** void approvals on version switch; harden shared-definition validation ([b3a2ade](https://github.com/sero-labs/sero/commit/b3a2adea40d08f37ceab486c8ca5146982297295)), closes [#226](https://github.com/sero-labs/sero/issues/226)
* **plugin-dev:** apply backend dev-session refreshes in place ([7da9947](https://github.com/sero-labs/sero/commit/7da9947b251aa6abcb6f43103c1dd540d574b61b))
* **subagent:** honor aborts during runner setup ([da890b7](https://github.com/sero-labs/sero/commit/da890b7c498467b3d73e19eb169030c24291f0c5))
* **subagent:** restore dropped agent prompt; publish real tool catalog ([05aa053](https://github.com/sero-labs/sero/commit/05aa053aad9f66b8026bd86e9b4610aebcf316fd))

### Documentation

* add initial Sero growth strategy ([13c4169](https://github.com/sero-labs/sero/commit/13c4169835f1a9d743e7bf956d3c803ee05519a4))
* add plain-language explanation guideline to AGENTS.md ([31c3978](https://github.com/sero-labs/sero/commit/31c397821cbd4420a67dd52bff7d1b86383cceb5))
* added analysis for sero orchestrator ([7028a2d](https://github.com/sero-labs/sero/commit/7028a2de9dc09185be97d6c0c4d829f657cc0411))
* added sero loom docs and removed internal plugin ([b6da1fa](https://github.com/sero-labs/sero/commit/b6da1fa6dfc81bfd12bce50c09c008c557407ce5))
* design spec for sero-graphify-plugin (profile-wide knowledge graphs) ([c5102cb](https://github.com/sero-labs/sero/commit/c5102cbdf2661a063f698be995b251afbd7e42e7))
* graphify CLI spike notes for graphify plugin ([ba597e8](https://github.com/sero-labs/sero/commit/ba597e80f2b8ba7f85232388f2caeecfa1140b61))
* **graphify:** add docs page, homepage feature banner, and launch content ([0e97dea](https://github.com/sero-labs/sero/commit/0e97dea1b586a437bf5d4903a67ead51a14ca2c7))
* **graphify:** plain-English guide, E2E pass record, machine-shared tools rule ([c0217a0](https://github.com/sero-labs/sero/commit/c0217a03c7ab10a4d899dbeb10f076d39f3b64de))
* **graphify:** plugin README and verification notes; scaffold hardening follow-ups ([25e1344](https://github.com/sero-labs/sero/commit/25e1344b935373fd13fceacb10d78be3033db585))
* implementation plan for sero-graphify-plugin ([6671861](https://github.com/sero-labs/sero/commit/66718613e8776eed0ed6ebb244a616b13977606f))
* initial orchestrator docs and references ([f69a881](https://github.com/sero-labs/sero/commit/f69a8815b935454076bfb3e53d31524f1fb3f1c1))
* **marketing:** add community inbox slot for the weekly digest ([c2c2afb](https://github.com/sero-labs/sero/commit/c2c2afbf9118e6bdae551c77ee944da9e716ae16))
* **marketing:** revise growth strategy and add phased implementation plan ([1ada513](https://github.com/sero-labs/sero/commit/1ada513650bebc47a46ce747977349793de3fd55))
* orchestrator ux overview ([1393d36](https://github.com/sero-labs/sero/commit/1393d36048b7d716976b9f14c3e0d32d6fd73722))
* **orchestrator:** add release-readiness backlog (spec 10) ([3e8753f](https://github.com/sero-labs/sero/commit/3e8753f72ba0bf809fe6e5d1fde9c8b0da04b2c2))
* **orchestrator:** clarify in the planner prompt that model steps can't read files ([0a4beb3](https://github.com/sero-labs/sero/commit/0a4beb30f8db1f60ef5f441c9a4e84a606cc8fac))
* **orchestrator:** fold branching into the data-model, run-flow, and guide (phase 4) ([71476e8](https://github.com/sero-labs/sero/commit/71476e81073091772d5dc819f600b9d610b66d39))
* **orchestrator:** plan the dirty-workspace-root override ([a878b8d](https://github.com/sero-labs/sero/commit/a878b8d01ab6c19d48cb915f00eef48c35624ca8))
* **orchestrator:** record context-fixes status; Issue 2 is not a bug ([2243293](https://github.com/sero-labs/sero/commit/22432932e88bfb586c862f558024c6fd56414ab6))
* **orchestrator:** record living loops e2e verification and the fix it found ([c77150d](https://github.com/sero-labs/sero/commit/c77150d83386f9a11a240da2cf22eb1d54331b02))
* **orchestrator:** record the hygiene-monitor fire-rate finding and the catalog curation bar ([06f52e7](https://github.com/sero-labs/sero/commit/06f52e77da9ded55ddc3d343dd379acf6acc2a38))
* **orchestrator:** record the PR [#226](https://github.com/sero-labs/sero/issues/226) review response in the catalog plan ([e97b648](https://github.com/sero-labs/sero/commit/e97b648cf51b8390141645fb57812415d60768f5))
* **orchestrator:** spec 15 — PR lifecycle loops ([b86405a](https://github.com/sero-labs/sero/commit/b86405a42145c3eaff16cc0d44e3e5b4f74dc2a0))
* **orchestrator:** spec for LLM-judged branching ([0a4618f](https://github.com/sero-labs/sero/commit/0a4618f837cb8e94ebb3ddf8e155d5db663579f3))
* **orchestrator:** spec living loops, pluggable delivery, and loop catalog ([a826bcc](https://github.com/sero-labs/sero/commit/a826bccbc7d6781d3fbfd8bbad3bbce8cd768b95))
* **orchestrator:** split reference out of the guide and add a screenshot walk-through ([f5fc689](https://github.com/sero-labs/sero/commit/f5fc6897e739e22bc3503c584d41acad6302fec7))
* **orchestrator:** user guide, UI outcome polish, and completed plan ([d4416b8](https://github.com/sero-labs/sero/commit/d4416b86143350850e25bcc47529f2654c660c65))
* **plans:** add factory migration phase 0 host-changes plan ([7035eee](https://github.com/sero-labs/sero/commit/7035eeec499b1beb8080dabd763e4d846e0050a5))
* **plugins:** document subagent platformTools, signal, and result metadata ([2302ed6](https://github.com/sero-labs/sero/commit/2302ed6e0daca09fc118063f3986cb3fe19c1d7d))
* sero orchestrator technical specs ([2930987](https://github.com/sero-labs/sero/commit/2930987a3ad6230f4b9c042f9224831a8ff8f8a1))
* update Sero growth positioning ([e052092](https://github.com/sero-labs/sero/commit/e052092669388a344e7c43240f1132d3870ad17b))
* updated spec docs ([595debb](https://github.com/sero-labs/sero/commit/595debb7851b5e94f13a345effab6380c93d8c69))

### Refactoring

* **orchestrator:** detail-view UX polish ([da7ab7a](https://github.com/sero-labs/sero/commit/da7ab7aab5ed44c48d1f10ac12b353c052573302))
* **orchestrator:** instructions-first for all LLM seams; trim parsing ([1f6f213](https://github.com/sero-labs/sero/commit/1f6f21340d40475129d090d6145d974f2073d24e))
* **orchestrator:** rename "lean baseline" to "default tools"; collapse in UI ([b8d5be4](https://github.com/sero-labs/sero/commit/b8d5be4f159301dd71863c612bdac16030f0751c))

## [0.4.0-beta.0](https://github.com/sero-labs/sero/compare/v0.3.1-beta.0...v0.4.0-beta.0) (2026-06-03)

### Features

* add caveman onboarding mode ([8eef7f8](https://github.com/sero-labs/sero/commit/8eef7f815e3c8d9e48edffdb59d30e20a2146808))

### Bug Fixes

* import files when connecting empty remote workspace ([a0b2221](https://github.com/sero-labs/sero/commit/a0b2221169f84c0a048cb9b5c1c5ade375e6d515))
* preserve profile content during memory field updates ([65d1e58](https://github.com/sero-labs/sero/commit/65d1e5824206060b154511f5429e28279781379e))

## [0.3.1-beta.0](https://github.com/sero-labs/sero/compare/v0.3.0-beta.0...v0.3.1-beta.0) (2026-06-02)

### Bug Fixes

* address mcp ux review feedback ([45fd3f9](https://github.com/sero-labs/sero/commit/45fd3f92949adb420f09f14011df522f6d050dc9))
* **desktop:** remove invalid ipv6 csp sources ([5a50dee](https://github.com/sero-labs/sero/commit/5a50dee01fc796634cfa7c202b95c812c3225843))
* **mcp:** simplify empty server state ([ccb2b5e](https://github.com/sero-labs/sero/commit/ccb2b5ed1671ac0014f31943e4f2d22d750e9c88))
* simplify mcp setup and isolate dev mode ([63cd357](https://github.com/sero-labs/sero/commit/63cd357b18f9043739ff31b75a331417cbfe2b8a))

## [0.3.0-beta.0](https://github.com/sero-labs/sero/compare/v0.2.11-beta.0...v0.3.0-beta.0) (2026-06-02)

### Features

* add shared theme customization ([c456636](https://github.com/sero-labs/sero/commit/c45663655baa800a05bc8c4482e368923d30328b))

### Bug Fixes

* allow loopback plugin dev remotes ([71c9e38](https://github.com/sero-labs/sero/commit/71c9e386151df6b1dd6ceea3da8d9e664026aa49))
* **web-remote:** use native image lightbox dialog ([5d22c38](https://github.com/sero-labs/sero/commit/5d22c38877abe7dc48c01444b86497a67ebb13a8))

## [0.2.11-beta.0](https://github.com/sero-labs/sero/compare/v0.2.10-beta.0...v0.2.11-beta.0) (2026-06-01)

### Bug Fixes

* address high-value react doctor findings ([10df50e](https://github.com/sero-labs/sero/commit/10df50e6e8079555e9f0e118d8a4c0fccda6eb36))
* address React Doctor cleanup regressions ([377a2c5](https://github.com/sero-labs/sero/commit/377a2c514d097e6a707a69684fe22527611d3771))
* address react doctor cleanup review ([428b357](https://github.com/sero-labs/sero/commit/428b357d1792afaf67b859ca2bcc76e4e966974a))
* address react doctor hook and key diagnostics ([5f90ce8](https://github.com/sero-labs/sero/commit/5f90ce8d0d7e56fd19d1b31d3f002048703f871b))
* address react doctor top issues ([e3d83fd](https://github.com/sero-labs/sero/commit/e3d83fd3ec942c156e910de5d6947ebb0d611bd1))
* keep verification commands sequential ([bf7c50d](https://github.com/sero-labs/sero/commit/bf7c50d7b456c61180dea3721bfc43c8a940906f))
* reduce react doctor accessibility issues ([e86062e](https://github.com/sero-labs/sero/commit/e86062e696cc3164fa3d91ec8dc46cc8b189cc64))
* reduce react doctor hook and async warnings ([5ea1f93](https://github.com/sero-labs/sero/commit/5ea1f932516f868fbc7a9ccfb407192e2c871d75))
* replace deprecated React context APIs ([bbb894f](https://github.com/sero-labs/sero/commit/bbb894fb43ffde704e53df08b61dcc974caab7bb))
* update profile setup branding ([b83fa5f](https://github.com/sero-labs/sero/commit/b83fa5f1a915b624b18db0f13ad2bd39acdb31b6))

### Refactoring

* reduce React Doctor findings ([8088b9d](https://github.com/sero-labs/sero/commit/8088b9dc1203fdee4c137c042cc3737c305075a7))

## [0.2.10-beta.0](https://github.com/sero-labs/sero/compare/v0.2.9-beta.0...v0.2.10-beta.0) (2026-06-01)

### Bug Fixes

* **desktop:** clean toolchain download staging ([914000b](https://github.com/sero-labs/sero/commit/914000be20bc41857a3b48621064a3a1b33033c7))
* resolve plugin host tool paths ([dc94991](https://github.com/sero-labs/sero/commit/dc94991bdb13aca755b2d99da4f3e24c1f961d62))

## [0.2.9-beta.0](https://github.com/sero-labs/sero/compare/v0.2.7-beta.0...v0.2.9-beta.0) (2026-06-01)

### Bug Fixes

* **desktop:** repair managed npm toolchains ([fc71390](https://github.com/sero-labs/sero/commit/fc7139035c4012d04de994d588950014ee1d8ee6))

## [0.2.6-beta.0](https://github.com/sero-labs/sero/compare/v0.2.5-beta.0...v0.2.6-beta.0) (2026-05-31)

### Bug Fixes

* **desktop:** publish host core tools from releases ([#200](https://github.com/sero-labs/sero/issues/200)) ([dc4b860](https://github.com/sero-labs/sero/commit/dc4b8601a4e1abec9cc008bc2d19ad2669ef632a))

## [0.2.5-beta.0](https://github.com/sero-labs/sero/compare/v0.2.4-beta.0...v0.2.5-beta.0) (2026-05-31)

## [0.2.4-beta.0](https://github.com/sero-labs/sero/compare/v0.2.3-beta.0...v0.2.4-beta.0) (2026-05-31)

### Documentation

* update sero plugin packaging guidance ([bb1f954](https://github.com/sero-labs/sero/commit/bb1f95499b0aed115c21d6cc3fb495ba84515d73))

### Refactoring

* externalize Alibaba provider plugin ([#197](https://github.com/sero-labs/sero/issues/197)) ([28b517d](https://github.com/sero-labs/sero/commit/28b517dc9a5a0b240d6e2aa198e1fd5e5b49c9ca))

## [0.2.3-beta.0](https://github.com/sero-labs/sero/compare/v0.2.2-beta.0...v0.2.3-beta.0) (2026-05-30)

### Bug Fixes

* **release:** run plugin build commands through Windows shell ([02f3a50](https://github.com/sero-labs/sero/commit/02f3a50524f0d8ac89f1aaa7a14437b468245dd9))

## [0.2.2-beta.0](https://github.com/sero-labs/sero/compare/v0.2.0-beta.0...v0.2.2-beta.0) (2026-05-30)

### Bug Fixes

* **release:** package desktop from pnpm deploy bundle + trim runtime deps ([#194](https://github.com/sero-labs/sero/issues/194)) ([72184f0](https://github.com/sero-labs/sero/commit/72184f04cacdb46cfe3586ab1b728529922818a4))

## [0.2.0-beta.0](https://github.com/sero-labs/sero/compare/v0.1.2-beta.0...v0.2.0-beta.0) (2026-05-27)

### Features

* macOS Developer ID signing + notarization ([#192](https://github.com/sero-labs/sero/issues/192)) ([f9cd8f4](https://github.com/sero-labs/sero/commit/f9cd8f4ef01cb43e47fbcd82a778f47dd41b3c2a))

### Bug Fixes

* ad-hoc sign macOS beta app bundles ([#191](https://github.com/sero-labs/sero/issues/191)) ([982ba61](https://github.com/sero-labs/sero/commit/982ba6198e52088579a2ef0589a7ad7f97bd66f6))
* **deps:** apply safe dependabot updates ([b9ef7e0](https://github.com/sero-labs/sero/commit/b9ef7e095cf9acd01b13da938ca29d0972252d23))
* **deps:** update tmp dependency chain ([59472ce](https://github.com/sero-labs/sero/commit/59472ce8ff22aabd490eb12c6fd5574401d92e94))
* import electron updater autoUpdater correctly ([840ad55](https://github.com/sero-labs/sero/commit/840ad55c4e6b5a6be87b711af2c20440413848dc))
* remove stale release assets ([68a467a](https://github.com/sero-labs/sero/commit/68a467a21ef9a8d1372088fa08d5daa8cac7f140))
* sync desktop release version ([66c29a3](https://github.com/sero-labs/sero/commit/66c29a3c629db5fcc8fdd07c862236fffdc76cc5))

### Documentation

* add desktop auto-update analysis and recommendation ([#193](https://github.com/sero-labs/sero/issues/193)) ([27323bf](https://github.com/sero-labs/sero/commit/27323bf09294ea43cb49ade541b3fe77e86836c2))
* macOS releases are signed + notarized — drop "Open Anyway" steps ([85827e3](https://github.com/sero-labs/sero/commit/85827e30515198085871e77e1a0e7e7bab7790f4))

## [0.1.2-beta.0](https://github.com/sero-labs/sero/compare/v0.1.1-beta...v0.1.2-beta.0) (2026-05-25)

### Bug Fixes

* **desktop:** skip source app watchers in packaged builds ([#188](https://github.com/sero-labs/sero/issues/188)) ([bae61e5](https://github.com/sero-labs/sero/commit/bae61e5a5ed73d1e505bb0594f74cd6c6c4fc606))
* **memory:** keep system prompt stable across turns for prompt caching ([#184](https://github.com/sero-labs/sero/issues/184)) ([0187ee7](https://github.com/sero-labs/sero/commit/0187ee704698006418610bfaf16a2b1f2ac8f936))

### Documentation

* align root beta governance docs ([3621275](https://github.com/sero-labs/sero/commit/362127549ecde5a9fb1e971e406d864e42dce07a))
* minor AGENT.md update about copy rules ([3d22b69](https://github.com/sero-labs/sero/commit/3d22b699518f7fe3858ce09584b76860f46512c5))
* minor copy changes ([cd19a40](https://github.com/sero-labs/sero/commit/cd19a403dfce4d9adc684e2ab7d9be35e65504b8))
* update public beta release messaging ([abb7afd](https://github.com/sero-labs/sero/commit/abb7afdfdb5ec6620e28d305bb32155f1f1c7041))

<!-- New release entries are prepended above this line by `pnpm release` -->

## Unreleased

### Changed
- Public documentation now describes Sero as a public beta desktop release with
  packaged installers for supported targets, while keeping source builds as the
  developer/contributor path and preserving beta support caveats.
- Desktop builds now use stock Electron 41.6.1. Native modules are rebuilt for
  Electron ABI 145 so packaged terminals (`node-pty`) and local SQLite-backed
  features (`better-sqlite3`) keep working. Sero no longer ships the Castlabs
  Electron fork, Widevine/VMP signing support, or the DRM-dependent Spotify
  playback path.

### Added
- Public beta governance files (`LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, issue templates, PR template, `CODEOWNERS`)
- public `README.md` with beta release positioning
- root `pnpm test` and `pnpm test:ci` command surface
- `apps/docs-site/` RSPress docs-platform skeleton and beta IA pages
- PR-gate workflow alignment to the root `pnpm test:ci` entrypoint
- OSS hygiene scan and release coordination process for public beta readiness

### Notes
- During beta, exact installer filenames may change between releases. Use
  GitHub Releases as the source of truth for current desktop artifacts.
