# Tasks

## 1. Board view-model

- [x] 1.1 Add `ui/lib/board.ts` with `boardOf(record, activity, context)` returning the top tile's text, the large tiles in order, and the plan steps and decisions made. Verify with unit tests for the large-tile cases, their order, and the absent tiles.
- [x] 1.2 Add the plain-words label table for tool names in `ui/lib/board.ts`. Verify with a unit test that a known tool gives its phrase and an unknown tool gives its own name.

## 2. Runtime

- [x] 2.2 Let an assumption carry its reason: `{ text, why }` through the `working` action, with saved plain strings still read. Verify with shape tests for both forms and a refused malformed item.
- [x] 2.1 Keep up to three finished tool calls of the current turn on the owner live notice and clear them when the turn ends. Verify with a runtime test that a fourth action drops the oldest and a new turn starts empty.

## 3. Board UI

- [x] 3.1 Add `ui/board.css` with the glass canvas, tiles and the prototype's rules, and apply the glass scope on the project page. Verify by screenshot against the prototype at 1500px.
- [x] 3.2 Build the hero tile: sentence, state line, progress and spend meters. Verify in the preview harness at the four moments.
- [x] 3.3 Build the main tile variants: question (reusing the answer and approve actions), stopped (reusing cap, retry, resume, Open Room and Review access), result (preview and checks), idle. Verify the existing ProjectPage action tests pass against the board.
- [x] 3.4 Build the Live tile for one agent and for several, with the timer, arriving text, recent actions and the session link. Verify with a component test for one and for two agents.
- [x] 3.5 Build the Plan and Decisions made tiles, with a link to the checks on a checked step and Change filling the message box. Verify with a component test that Change fills and focuses the box and sends nothing.
- [x] 3.6 Replace the body of `ProjectPage.tsx` with the board and remove the parts it replaces (`StateLine`, the overview links, the header action plumbing that moved). Keep each file at or below 500 lines. Verify with `pnpm typecheck` and the Architect test suite.

## 6. Pictures

- [x] 6.1 Add the `picture` request: a step's saved capture, or the last browser screenshot, with the path check and the newer-than rule. Verify with tests against real files.
- [x] 6.2 Show the proof picture on a checked step and on the result, and the last browser screenshot in Live for the current turn. Verify in the preview harness with a stubbed picture.
- [x] 6.3 Check the Live tile and the proof picture in the running app, with a real project that has a capture and a working Architect. Seen in the real Sudoku run of 2026-10-08 (`evidence/real-run/`).
- [ ] 6.4 See the Architect's last browser screenshot in Live in the running app. The real run's Architect never used its browser, so this is still only proven in the preview harness.
- [x] 6.5 Changes from the real run: Room faces on the Live rows, no resetting clocks, a fixed box for arriving text, a steady state line, decisions listed under the plan, the host type scale, and "Approve the start" while the start prompt is open.

## 4. Work view and preview fixtures

- [x] 4.1 Remove the Live tab from the Work view and send a saved or linked live tab to the project board. Verify with a navigation test.
- [x] 4.2 Add preview fixtures for the four prototype moments, with the Architect working itself and live. Verify each state opens in the preview harness.

## 5. Compare with the prototype

- [x] 5.1 Capture the built board and the prototype at the four moments at the same size and compare them frame by frame. Fix every difference or record why it stays. Deliver the paired screenshots. The pairs are in `evidence/`. Differences that stay: the top bar keeps Open session and the project menu, the meter reads "steps done", and a question keeps its optional note field.
- [x] 5.2 Run root `pnpm typecheck --force`, the Architect suite and React Doctor on the changed UI. Verify all pass.
