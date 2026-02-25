#!/usr/bin/env python3
"""
Sero Browser Helper — Playwright automation script for agent computer use.

Runs inside the container, accepts JSON commands on stdin, writes JSON
responses to stdout. The browser instance persists between commands until
explicitly closed.

Usage:
    echo '{"action":"launch","url":"http://localhost:3000"}' | python3 /tmp/sero-browser-helper.py
    # Or for multi-command mode (one JSON per line):
    python3 /tmp/sero-browser-helper.py --server
"""

import sys
import json
import base64
import traceback

# Lazy imports — only load playwright when needed
_browser = None
_context = None
_page = None


def _ensure_playwright():
    """Import playwright and return the sync API module."""
    from playwright.sync_api import sync_playwright
    return sync_playwright


def launch(params):
    """Launch a headless Chromium browser and optionally navigate to a URL."""
    global _browser, _context, _page

    if _browser is not None:
        return {"ok": True, "message": "Browser already running. Use 'navigate' to go to a URL."}

    pw_cm = _ensure_playwright()()
    pw = pw_cm.__enter__()
    # Store context manager so we can clean up
    launch.pw_cm = pw_cm
    launch.pw = pw

    _browser = pw.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ],
    )

    viewport = params.get("viewport", {})
    _context = _browser.new_context(
        viewport={
            "width": viewport.get("width", 1280),
            "height": viewport.get("height", 720),
        },
        user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )
    _page = _context.new_page()

    url = params.get("url")
    if url:
        _page.goto(url, wait_until="domcontentloaded", timeout=30000)
        return {"ok": True, "message": f"Browser launched and navigated to {url}", "title": _page.title(), "url": _page.url}

    return {"ok": True, "message": "Browser launched (no URL loaded yet)"}


def navigate(params):
    """Navigate to a URL."""
    global _page
    _require_page()

    url = params["url"]
    wait_until = params.get("wait_until", "domcontentloaded")
    _page.goto(url, wait_until=wait_until, timeout=30000)
    return {"ok": True, "url": _page.url, "title": _page.title()}


def click(params):
    """Click on an element by CSS selector or coordinates."""
    global _page
    _require_page()

    selector = params.get("selector")
    x = params.get("x")
    y = params.get("y")

    if selector:
        _page.click(selector, timeout=10000)
        return {"ok": True, "message": f"Clicked on '{selector}'"}
    elif x is not None and y is not None:
        _page.mouse.click(x, y)
        return {"ok": True, "message": f"Clicked at ({x}, {y})"}
    else:
        return {"ok": False, "error": "Provide 'selector' or both 'x' and 'y'"}


def type_text(params):
    """Type text into an element or the focused element."""
    global _page
    _require_page()

    text = params["text"]
    selector = params.get("selector")
    clear = params.get("clear", False)

    if selector:
        if clear:
            _page.fill(selector, text, timeout=10000)
        else:
            _page.click(selector, timeout=10000)
            _page.keyboard.type(text)
        return {"ok": True, "message": f"Typed into '{selector}'"}
    else:
        _page.keyboard.type(text)
        return {"ok": True, "message": "Typed into focused element"}


def press_key(params):
    """Press a keyboard key (e.g. Enter, Tab, Escape)."""
    global _page
    _require_page()

    key = params["key"]
    _page.keyboard.press(key)
    return {"ok": True, "message": f"Pressed '{key}'"}


def screenshot(params):
    """Take a screenshot of the current page, return as base64 PNG."""
    global _page
    _require_page()

    full_page = params.get("full_page", False)
    selector = params.get("selector")

    if selector:
        element = _page.query_selector(selector)
        if not element:
            return {"ok": False, "error": f"Element not found: {selector}"}
        raw = element.screenshot(type="png")
    else:
        raw = _page.screenshot(type="png", full_page=full_page)

    b64 = base64.b64encode(raw).decode("ascii")
    return {
        "ok": True,
        "screenshot": b64,
        "url": _page.url,
        "title": _page.title(),
    }


def scroll(params):
    """Scroll the page up or down."""
    global _page
    _require_page()

    direction = params.get("direction", "down")
    amount = params.get("amount", 500)
    selector = params.get("selector")

    if selector:
        element = _page.query_selector(selector)
        if element:
            element.scroll_into_view_if_needed()
            return {"ok": True, "message": f"Scrolled '{selector}' into view"}

    delta = amount if direction == "down" else -amount
    _page.mouse.wheel(0, delta)
    return {"ok": True, "message": f"Scrolled {direction} by {abs(amount)}px"}


def evaluate(params):
    """Execute JavaScript in the page and return the result."""
    global _page
    _require_page()

    expression = params["expression"]
    result = _page.evaluate(expression)
    return {"ok": True, "result": result}


def get_text(params):
    """Get text content of an element or the full page."""
    global _page
    _require_page()

    selector = params.get("selector")
    if selector:
        element = _page.query_selector(selector)
        if not element:
            return {"ok": False, "error": f"Element not found: {selector}"}
        text = element.text_content() or ""
    else:
        text = _page.text_content("body") or ""

    # Truncate if too long
    max_len = params.get("max_length", 10000)
    if len(text) > max_len:
        text = text[:max_len] + f"\n...[truncated, {len(text)} chars total]"

    return {"ok": True, "text": text}


def wait(params):
    """Wait for a selector to appear or a timeout."""
    global _page
    _require_page()

    selector = params.get("selector")
    timeout = params.get("timeout", 10000)

    if selector:
        _page.wait_for_selector(selector, timeout=timeout)
        return {"ok": True, "message": f"Element '{selector}' is now visible"}
    else:
        _page.wait_for_timeout(timeout)
        return {"ok": True, "message": f"Waited {timeout}ms"}


def close(params):
    """Close the browser."""
    global _browser, _context, _page

    if _browser is not None:
        try:
            _browser.close()
        except Exception:
            pass
        _browser = None
        _context = None
        _page = None

    if hasattr(launch, "pw_cm"):
        try:
            launch.pw_cm.__exit__(None, None, None)
        except Exception:
            pass

    return {"ok": True, "message": "Browser closed"}


def _require_page():
    """Raise if no browser/page is active."""
    if _page is None:
        raise RuntimeError("No browser running. Use 'launch' first.")


# ── Action dispatch ───────────────────────────────────────────

ACTIONS = {
    "launch": launch,
    "navigate": navigate,
    "click": click,
    "type": type_text,
    "press_key": press_key,
    "screenshot": screenshot,
    "scroll": scroll,
    "evaluate": evaluate,
    "get_text": get_text,
    "wait": wait,
    "close": close,
}


def handle_command(cmd):
    """Dispatch a single JSON command and return a JSON response."""
    action = cmd.get("action")
    if not action:
        return {"ok": False, "error": "Missing 'action' field"}

    handler = ACTIONS.get(action)
    if not handler:
        return {"ok": False, "error": f"Unknown action: {action}. Available: {', '.join(ACTIONS.keys())}"}

    try:
        return handler(cmd)
    except Exception as e:
        return {"ok": False, "error": str(e), "traceback": traceback.format_exc()}


def main():
    """Main entry point. Reads JSON commands from stdin."""
    if "--server" in sys.argv:
        # Multi-command mode: read one JSON per line from stdin
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                cmd = json.loads(line)
                result = handle_command(cmd)
            except json.JSONDecodeError as e:
                result = {"ok": False, "error": f"Invalid JSON: {e}"}
            print(json.dumps(result), flush=True)
    else:
        # Single-command mode: read entire stdin as one JSON
        raw = sys.stdin.read().strip()
        if not raw:
            print(json.dumps({"ok": False, "error": "No input"}))
            return
        try:
            cmd = json.loads(raw)
            result = handle_command(cmd)
        except json.JSONDecodeError as e:
            result = {"ok": False, "error": f"Invalid JSON: {e}"}
        print(json.dumps(result))


if __name__ == "__main__":
    main()
