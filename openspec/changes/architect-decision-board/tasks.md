# Tasks

## 1. Board view-model

- [ ] 1.1 Add `shared/board.ts` with `boardOf(record, context)` returning the hero, the one main tile, and the plan and decisions-made tiles or null. Verify with unit tests for the five main-tile cases, their order, and the absent tiles.
- [ ] 1.2 Add the plain-words label table for tool names in `shared/board.ts`. Verify with a unit test that a known tool gives its phrase and an unknown tool gives its own name.

## 2. Recent actions in the owner live notice

- [ ] 2.1 Keep up to three finished tool calls of the current turn on the owner live notice and clear them when the turn ends. Verify with a runtime test that a fourth action drops the oldest and a new turn starts empty.

## 3. Board UI

- [ ] 3.1 Add `ui/board.css` with the glass canvas, tiles and the prototype's rules, and apply the glass scope on the project page. Verify by screenshot against the prototype at 1500px.
- [ ] 3.2 Build the hero tile: sentence, state line, progress and spend meters. Verify in the preview harness at the four moments.
- [ ] 3.3 Build the main tile variants: question (reusing the answer and approve actions), stopped (reusing cap, retry, resume, Open Room and Review access), result (preview and checks), idle. Verify the existing ProjectPage action tests pass against the board.
- [ ] 3.4 Build the Live tile for one agent and for several, with the timer, arriving text, recent actions and the session link. Verify with a component test for one and for two agents.
- [ ] 3.5 Build the Plan and Decisions made tiles, with the proof picture on a checked step and Change filling the message box. Verify with a component test that Change fills and focuses the box and sends nothing.
- [ ] 3.6 Replace the body of `ProjectPage.tsx` with the board and remove the parts it replaces (`StateLine`, the overview links, the header action plumbing that moved). Keep each file at or below 500 lines. Verify with `pnpm typecheck` and the Architect test suite.

## 4. Work view and preview fixtures

- [ ] 4.1 Remove the Live tab from the Work view and send a saved or linked live tab to the project board. Verify with a navigation test.
- [ ] 4.2 Add preview fixtures for the four prototype moments, with the Architect working itself and live. Verify each state opens in the preview harness.

## 5. Compare with the prototype

- [ ] 5.1 Capture the built board and the prototype at the four moments at the same size and compare them frame by frame. Fix every difference or record why it stays. Deliver the paired screenshots.
- [ ] 5.2 Run root `pnpm typecheck --force`, the Architect suite and React Doctor on the changed UI. Verify all pass.
