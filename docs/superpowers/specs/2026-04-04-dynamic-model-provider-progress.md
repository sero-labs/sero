# Dynamic Model Provider — Progress Status

**Branch:** `feat/dynamic-model-selection`
**Date:** 2026-04-04

## Completed Tasks (all 17 from the implementation plan)

All implementation tasks for the Dynamic Model Provider system are complete and
passing typecheck. See
`docs/superpowers/specs/2026-04-04-dynamic-model-provider-design.md` for the
surviving design context:

1. Model tier types and settings helpers (`model-tiers.ts`, `ipc.ts`)
2. Tier-aware model resolver (`resolve-tier-model.ts`)
3. Agent frontmatter parsing for structured model fields
4. `resolve.ts` updated for structured model fields + tier aliases
5. Subagent runner tier resolution
6. Model fallback chain reordered (provider-neutral)
7. Hardcoded Claude defaults removed from `main.ts` + `shared-infra.ts`
8. Adhoc-agent uses LOW tier + provider-neutral ordering
9. `pickFallbackModel` checks HIGH tier before fallback chain
10. Model tier IPC handlers + profile clone support
11. Anthropic warning banner in auth dialog
12. TierPicker onboarding component (popover-based, searchable)
13. TierPicker integrated into OnboardingWizard
14. ProfileForm clone label updated
15. All 13 agent templates updated to structured model fields
16. Final typecheck + verification (all passing)
17. `models.list` IPC bridge verified

## Bug Fixes Applied During Testing

These were discovered during manual testing of the onboarding flow:

- **Trackpad scrolling in TierPicker** — `onWheel` stopPropagation on
  PopoverContent to prevent Dialog overlay from intercepting scroll events
- **Auth reload in getProviders** — `authStorage.reload()` added before
  checking provider credentials (pre-existing bug)
- **Fallback retry on auth failure** — OnboardingWizard now tries switching
  to a model from a different provider when one fails, instead of
  immediately showing the sign-in screen
- **Error handling in fallback path** — wrapped fallback retry logic in
  try/catch to prevent unhandled errors leaving wizard stuck
- **getModelState resilience** — `ensureSessionHasAvailableModel` errors
  caught so the model list still returns even when model switch fails
- **Tier model application** — `applyTierModel` added to switch session to
  user's chosen tier model after opening, with cross-provider fallback
- **Unused export cleanup** — removed dead `hasModelTiers` function

## Known Issues / Follow-Up Work

### Critical: Onboarding auth resilience

The onboarding flow with cloned credentials is fragile when OAuth tokens are
expired. See `docs/superpowers/specs/2026-04-04-onboarding-resilience-analysis.md`
for full analysis and proposed solution.

Key problems:
- Expired OAuth tokens make models appear available but they can't be used
- Silent failures when selecting models with broken auth
- No user feedback about which provider failed
- Profile clone doesn't validate tokens before copying

### Deferred: Inline model picker on resolution failure

The spec describes an inline model picker UI in the chat area when no model
can be resolved for a subagent. Currently the system falls back to the first
available model. The inline picker was deferred as a follow-up.

## Commit History

```
b416833 fix: robust tier model application with cross-provider fallback
a4d1bf4 fix: apply user's tier model to onboarding memory session
85c9e66 fix: catch model switch errors in getModelState handler
9b7fb10 fix: prevent unhandled errors in onboarding fallback retry path
6eacc35 fix: retry with fallback provider when onboarding auth fails
0a17750 fix: reload auth storage before checking providers in getProviders
ac2622f fix: enable trackpad scrolling in TierPicker model popover
b9bcae5 fix: replace flat model list with popover picker in TierPicker
19dd3aa chore: remove unused hasModelTiers export
bdbf509 feat: integrate TierPicker into onboarding wizard between auth and memory
da4abc8 feat: create TierPicker onboarding component for model tier selection
15e0dfa feat: add Anthropic consumer subscription warning in auth dialog
6cedb78 feat: update all agent templates to use structured model fields with tier aliases
38d7141 feat: update profile clone label to mention model preferences
4499e94 feat: add model tier IPC handlers and profile clone support
9bdc98c feat: check HIGH tier model in pickFallbackModel before walking chain
bb69070 feat: remove hardcoded Claude defaults and add tier-aware model selection
86bb030 feat: resolve tier aliases in subagent runner model selection
8f67541 feat: reorder model fallback chain to be provider-neutral
356a415 feat: support structured model fields in agent config and resolution
c857533 feat: add model tier types and tier-aware model resolver
4e57279 docs: add dynamic model provider implementation plan
df3a031 docs: add dynamic model provider system design spec
```
