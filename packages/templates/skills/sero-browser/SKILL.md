---
name: sero-browser
description: Use when a user asks to open, browse, capture, screenshot, or record a website/page; mentions browser tabs, visible Browser panel, screen recording, web navigation, website interaction, or browser automation; or when choosing between `sero browser`, `sero app record`, and `automation_browser`.
---

# Sero Browser

Use the visible Sero Browser panel for user-facing web browsing and recordings. Use hidden automation only when the user explicitly asks for headless/runtime browser automation or when testing a locally running app.

## Visible browser workflow

- Prefer `sero-cli` for visible browser tasks.
- Start by showing the panel: `sero browser show`.
- Navigate the current tab with `sero browser goto <url>`.
- Use `sero browser open <url>` only when the user asks for a new tab/window or multiple pages side-by-side.
- If unsure what tabs exist, run `sero browser list` before opening anything new.
- For page text/content, prefer `sero browser get-text` over screenshots.
- To move the visible page, use `sero browser scroll --amount <px>` or `sero browser scroll --direction up --amount <px>`; do not use `sero app scroll` for Browser pages.
- Use `sero browser screenshot` only when visual evidence is needed.

## Recording workflow

For prompts like “record the browser while opening a site”:

1. `sero browser show`
2. `sero browser goto <initial-url>`
3. `sero app record start`
4. Continue navigation with `sero browser goto <next-url>` or `sero browser navigate <tab-id> <url>`
5. After the final navigation completes, wait 3–5 seconds for the page to render.
6. Run `sero app record stop` as its own separate command.

You may batch `browser show`, initial navigation, `app record start`, and intermediate `browser goto` commands when that is convenient. Do not include `app record stop` in the same multi-command invocation as the final `browser goto`, because the recording can stop before the last page renders.

Do not use `sero app screenshot --app web` or open the `web` app for browser pages. The `web` app/plugin is separate from the Sero Browser panel.

## Single-tab rule

- Keep one browser tab for a single browsing task.
- Do not repeatedly call `sero browser open` during one task.
- After the first tab exists, use `goto` to reuse the active tab.
- Use `navigate <tab-id> <url>` only when you intentionally selected a tab from `sero browser list`.

## Hidden automation browser

`automation_browser` is hidden. It does not create visible tabs and is not captured by `sero app record` / `sero app screenshot`.

Use `automation_browser` for:
- testing a locally running app,
- taking hidden automation screenshots,
- verifying DOM interactions when no visible recording is requested.

Do not use `automation_browser` for user-facing browsing or visible screen recordings.

## Common routing examples

- “Open BBC News, record the browser, go to Sport, then Football, then Premier League Table” → visible browser workflow; one tab; use `goto` for each navigation; wait 3–5 seconds after the table page loads, then stop app recording in a separate command.
- “Take a screenshot of this website” → `sero browser show`, `sero browser goto <url>` if needed, then `sero browser screenshot`.
- “Test my local web UI with clicks and assertions” → local dev server + `automation_browser` is acceptable unless the user asks for visible recording.
