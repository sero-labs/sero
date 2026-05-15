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
- Use `sero browser screenshot` only when visual evidence is needed.

## Recording workflow

For prompts like “record the browser while opening a site”:

1. `sero browser show`
2. `sero browser goto <initial-url>`
3. `sero app record start`
4. Continue navigation with `sero browser goto <next-url>` or `sero browser navigate <tab-id> <url>`
5. `sero app record stop`

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

- “Open BBC News, record the browser, go to Sport, then Football, then Premier League Table” → visible browser workflow; one tab; use `goto` for each navigation; stop app recording at the end.
- “Take a screenshot of this website” → `sero browser show`, `sero browser goto <url>` if needed, then `sero browser screenshot`.
- “Test my local web UI with clicks and assertions” → local dev server + `automation_browser` is acceptable unless the user asks for visible recording.
