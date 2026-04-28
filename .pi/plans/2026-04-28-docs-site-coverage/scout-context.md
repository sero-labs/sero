# Context for: docs-site coverage planning

## Relevant Files
- `apps/docs-site/rspress.config.ts` — current IA/sidebar/nav for the docs site; guides are grouped into Start Here, Core Functionality, Built-in Capabilities, Plugins and Apps; reference is grouped into Foundations, Runtime and State, Plugin Authors, Quality and Safety, Help and Limits.
- `apps/docs-site/docs/index.md` — homepage/front door; establishes alpha scope, screenshots, and entry links.
- `apps/docs-site/docs/guide/*.md` — current public guide pages (overview, setup, workspace/chat, explorer, models/providers, MCP, themes, memory, remote control, scheduler, git, plugins/apps, app store).
- `apps/docs-site/docs/reference/*.md` — current reference pages (architecture, containers-host-mode, state-and-folders, plugins, plugin quick paths/examples, testing/evals, security/privacy, troubleshooting, limitations, support scope).
- `apps/docs-site/package.json` — docs-site scripts (`dev`, `build`, `typecheck`, `preview`) use `rspress` directly.
- `docs/plans/docs-site-complete-coverage-plan.md` — source plan with phase ordering, coverage gaps, and desired deliverables.
- `docs/README.md` — curated public-doc scope and what must stay out of public nav.
- `docs/features/subagents.md`, `docs/specs/subagents.md` — source docs for subagents/agent definitions.
- `docs/guides/macos-containers.md`, `docs/decisions.md` (AD-018/AD-019) — container/runtime source material.
- `docs/testing/eval-guide.md`, `promptfooconfig.yaml`, `eval/**` — eval workflow and scenario source of truth.
- `apps/desktop/electron/cli/commands/**` — canonical `sero-cli` command implementations and help strings.
- `apps/desktop/electron/shared/auth/provider-catalog.ts`, `apps/desktop/electron/features/onboarding/provider-health.ts`, `plugins/*/package.json` — provider catalogs and local/custom provider health resolution.
- `apps/desktop/electron/features/subagent/**` — subagent discovery, resolution, runtime, and tool registration.
- `apps/desktop/electron/features/container/**`, `apps/desktop/electron/cli/commands/container/**`, `apps/desktop/electron/cli/commands/browser/browser.ts`, `apps/desktop/electron/cli/commands/apps/app-control*.ts` — container/dev-server/browser/app-control sources for the missing operator guides/reference.
- `plugins/sero-*-plugin/package.json` and plugin READMEs — external/built-in plugin metadata and documentation targets.

## Project Structure
- `apps/docs-site/` is a standalone Rspress app with its own `docs/`, `public/`, `styles.css`, and build output in `dist/`.
- The site currently exposes only the existing guide/reference pages above; there are no docs-site pages yet for `sero-cli`, subagents, LM Studio/local LLM setup, browser/app capture, or coverage audit.
- The broader monorepo keeps the actual product truth in `apps/desktop/electron/**` plus root `docs/**`; the docs-site is meant to curate and explain that truth, not duplicate internal plans.
- `plugins/` contains built-in plugins in-repo (`sero-admin-plugin`, `sero-cron-plugin`, `sero-git-plugin`, `sero-mcp-plugin`, `sero-memory-plugin`, `sero-user-feedback-plugin`, `sero-web-plugin`, `sero-alibaba-plugin`) and is the source for plugin/provider manifests.

## Conventions
- Guide pages are task-oriented: plain-language overview first, then quick path, then examples and only later details.
- Reference pages are canonical/technical but still include a short explanation and practical examples.
- Existing docs use short section headings, embedded screenshots from `apps/docs-site/docs/assets/images/`, and occasional tables for compact reference.
- Sidebar/nav uses human-friendly labels rather than file/module names.
- Plan language emphasizes "assume zero Sero knowledge" and "source-of-truth based docs".

## Dependencies
- `rspress` is the only docs-site runtime dependency in `apps/docs-site/package.json`.
- Root scripts relevant to docs/evals are `pnpm build`, `pnpm typecheck`, `pnpm eval`, `pnpm eval:snapshot`, `pnpm eval:view`.
- Provider catalog data comes from Pi SDK helpers (`getOAuthProviders`, `getEnvApiKey`) plus plugin manifests.
- Plugin/provider metadata uses `sero.app`, `sero.plugin`, and `sero.providers` fields in package manifests.

## Key Findings
- The current docs-site already covers the basics of onboarding, workspace/chat, explorer, models/providers, MCP, memory, web, remote control, scheduler, git, plugins/apps, app store, architecture, containers-host-mode, state/folders, testing/evals, security/privacy, troubleshooting, and limitations.
- The plan’s biggest missing user-facing areas are: `sero-cli` reference, visual/app capture guide, LM Studio/local models, subagents/agent definitions, container isolation and dev-server networking, and external plugin catalog/pages.
- Provider support is broader than the current docs imply: built-in API-key providers include Anthropic, OpenAI, Google/Gemini, OpenRouter, xAI, Groq, Cerebras, Mistral, Azure OpenAI, Hugging Face, Vercel AI Gateway, ZAI, OpenCode, Kimi, plus plugin-defined providers like Alibaba Coding Plan; OAuth providers come from Pi SDK; local/custom providers are read from `~/.sero-ui/agent/models.json`.
- `sero-cli` has concrete built-in namespaces already implemented in `apps/desktop/electron/cli/commands/**`: `app`, `browser`, `workspace`, `terminal`, `editor`, `devserver`, `vcs`, `session`, `set-title`, plus bridge-backed plugin tools.
- Subagent behavior is real and documented in code: discovery reads markdown files from `~/.sero-ui/agent/agents/`, frontmatter is JSON-in-fenced-block or `---` form, and runtime/tooling explicitly prevents recursion (`subagent`/`create_agent` not available to child sessions).
- Browser/app control is split between the visible in-app browser and the hidden automation browser used by `sero app record` / `browser` tooling; the docs should distinguish those clearly.
- Container docs need to explain workspace container per workspace, container IP exposure, and why dev-server previews don’t depend on host ports being free.

## Gotchas
- The docs-site README currently claims a narrower IA than the plan; the sidebar/nav will likely need deliberate re-architecture, not just page additions.
- Some plan references are alpha/partial and should be documented as such rather than implied as finished product behavior.
- The public docs-site should not link internal planning trees or maintainer-only docs from nav.
- Several source areas are split across multiple files; command/provider pages should cite the manifest or registry file that owns each table row.
- The docs repo already contains many screenshots/assets under `apps/docs-site/docs/assets/images/`; new coverage may need new captures for missing workflows rather than reusing unrelated screenshots.
