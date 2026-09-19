/** Dumps the interactive controls on screen, so the audit walkers target real names. */

import type { Page } from '@playwright/test';

export interface ControlDump {
  buttons: string[];
  tabs: string[];
  summaries: string[];
  headings: string[];
  links: string[];
}

const READER = `
  (root) => {
    const text = (node) => (node.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 90);
    const pick = (selector) => {
      const seen = new Set();
      for (const node of root.querySelectorAll(selector)) {
        const label = node.getAttribute('aria-label') || text(node);
        if (label) seen.add(label);
      }
      return [...seen];
    };
    return {
      buttons: pick('button'),
      tabs: pick('[role="tab"]'),
      summaries: pick('summary'),
      headings: pick('h1,h2,h3,h4'),
      links: pick('a'),
    };
  }
`;

/** Controls inside the active app panel. */
export async function dumpControls(page: Page): Promise<ControlDump> {
  return page.evaluate(
    ([reader]) => {
      const root = document.querySelector('[data-app-panel]') ?? document.body;
      // eslint-disable-next-line no-eval
      return (eval(reader) as (node: Element) => ControlDump)(root);
    },
    [READER],
  ) as Promise<ControlDump>;
}

/** Controls anywhere in the window — menus, dialogs and the shell sidebar. */
export async function dumpAll(page: Page): Promise<ControlDump> {
  return page.evaluate(
    ([reader]) => {
      // eslint-disable-next-line no-eval
      return (eval(reader) as (node: Element) => ControlDump)(document.body);
    },
    [READER],
  ) as Promise<ControlDump>;
}

/** The top-level rows of the current list, in screen order. */
export async function dumpRows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-app-panel]');
    if (!panel) return [];
    return [...panel.querySelectorAll('button')]
      .filter((node) => node.textContent && node.textContent.trim().length > 40)
      .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 110));
  });
}
