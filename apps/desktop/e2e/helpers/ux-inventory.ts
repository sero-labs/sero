/**
 * Control inventory for the UX audit.
 *
 * Implements the same `AuditCapture` interface the capture walk already takes,
 * so every existing walk module drives it unchanged. Instead of a PNG it
 * records what a screen can actually DO: every button, tab, link, input and
 * disclosure inside the app panel, by accessible name.
 *
 * This exists because a screenshot cannot prove a control still exists in a
 * proposed design. A proposal is an enhancement only if every control here is
 * still reachable in it, so the inventory is the list that has to be answered
 * one entry at a time.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { AuditCapture, RegisterRow, ShotMeta } from './ux-audit';

export interface Control {
  /** button, tab, link, textbox, checkbox, combobox, summary, menuitem. */
  kind: string;
  /** Accessible name, or the trimmed text when there is none. */
  name: string;
  disabled: boolean;
}

export interface InventoryRow extends ShotMeta {
  capturedAt: string;
  heading: string | null;
  controls: Control[];
  /** Headings inside the panel, which name the sections a redesign must account for. */
  sections: string[];
  reason?: string;
}

/** Collected in the page, so the names are the ones a screen reader would read. */
async function readControls(page: Page): Promise<{ heading: string | null; controls: Control[]; sections: string[] }> {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-app-panel]') ?? document.body;
    const name = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria) return aria.trim();
      const title = el.getAttribute('title');
      if (title) return title.trim();
      return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    };
    const kindOf = (el: Element): string | null => {
      const role = el.getAttribute('role');
      if (role && ['tab', 'menuitem', 'link', 'button', 'checkbox', 'combobox', 'switch'].includes(role)) return role;
      const tag = el.tagName.toLowerCase();
      if (tag === 'button') return 'button';
      if (tag === 'a') return 'link';
      if (tag === 'summary') return 'summary';
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'input') {
        const type = (el as HTMLInputElement).type;
        return type === 'checkbox' || type === 'radio' ? type : 'textbox';
      }
      return null;
    };
    const controls: Control[] = [];
    const seen = new Set<string>();
    for (const el of Array.from(panel.querySelectorAll('*'))) {
      const kind = kindOf(el);
      if (!kind) continue;
      // A control inside another control is the same affordance twice.
      if (el.parentElement?.closest('button,[role="button"],[role="tab"],summary')) continue;
      const label = name(el).slice(0, 90);
      if (!label) continue;
      const key = `${kind}::${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      controls.push({ kind, name: label, disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' });
    }
    const sections = Array.from(panel.querySelectorAll('h1,h2,h3,h4'))
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 90))
      .filter(Boolean);
    const first = panel.querySelector('h1,h2,h3');
    return {
      heading: first ? (first.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) : null,
      controls,
      sections: Array.from(new Set(sections)),
    };
  });
}

/**
 * Drop-in replacement for `createAuditCapture`. `gap` and `write` keep the same
 * meaning; `setWidth` still resizes, because a narrow layout can hide a control
 * and that is exactly the kind of loss this inventory is meant to catch.
 */
export function createInventoryCapture(page: Page, outFile: string): AuditCapture {
  const rows: InventoryRow[] = [];

  async function shot(meta: ShotMeta): Promise<boolean> {
    await page.waitForTimeout(400);
    try {
      const { heading, controls, sections } = await readControls(page);
      rows.push({ ...meta, capturedAt: new Date().toISOString(), heading, controls, sections });
      return true;
    } catch (error) {
      gap(meta, `inventory failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  function gap(meta: ShotMeta, reason: string): void {
    rows.push({ ...meta, capturedAt: new Date().toISOString(), heading: null, controls: [], sections: [], reason });
  }

  function write(): void {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const fresh = new Set(rows.map((row) => row.id));
    let kept: InventoryRow[] = [];
    if (fs.existsSync(outFile)) {
      try {
        const previous = JSON.parse(fs.readFileSync(outFile, 'utf8')) as { rows?: InventoryRow[] };
        kept = (previous.rows ?? []).filter((row) => !fresh.has(row.id));
      } catch {
        kept = [];
      }
    }
    fs.writeFileSync(outFile, `${JSON.stringify({ version: 1, rows: [...kept, ...rows] }, null, 2)}\n`, 'utf8');
  }

  async function setWidth(width: number): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(400);
  }

  // The walk types its capture as AuditCapture; an inventory row is not a
  // register row, so `rows()` is not meaningful here and returns nothing.
  return { shot, gap, rows: () => [] as RegisterRow[], write, setWidth };
}
