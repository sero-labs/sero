/**
 * Workspace and cross-app navigation capture walk.
 *
 * The workspace tree lives in the shell sidebar, not in an app panel, so these
 * shots are of the whole window. Nothing here creates, removes or reconnects a
 * workspace: the walk opens the menus and photographs them, then presses
 * Escape.
 */

import type { Page } from '@playwright/test';
import type { AuditCapture } from '../helpers/ux-audit';
import { openApp } from '../helpers/ux-audit';
import { layout as layoutSel } from '../helpers/selectors';
import { clickIfPresent, closeOverlay } from './actions';

const AREA = 'workspaces' as const;

/** A workspace row in the shell sidebar, addressed by its display label. */
function workspaceRow(page: Page, label: string) {
  return page.locator(layoutSel.sidebarPanel).getByRole('button', { name: label, exact: true }).first();
}

async function showSidebar(page: Page): Promise<boolean> {
  const panel = page.locator(layoutSel.sidebarPanel).first();
  if (await panel.isVisible().catch(() => false)) return true;
  await clickIfPresent(page, page.locator(layoutSel.sidebarToggle).first());
  await page.waitForTimeout(900);
  return panel.isVisible().catch(() => false);
}

export async function captureWorkspaces(page: Page, capture: AuditCapture, width: number): Promise<void> {
  await openApp(page, 'explorer');
  await page.waitForTimeout(1_200);
  const sidebar = await showSidebar(page);
  if (!sidebar) {
    capture.gap(
      { id: `ws-tree-${width}`, area: AREA, page: 'Workspace tree', state: 'populated', task: 'Find the workspace I want', width },
      'The shell sidebar would not open.',
    );
    return;
  }

  await capture.shot({
    id: `ws-tree-${width}`,
    area: AREA,
    page: 'Workspace tree',
    state: 'populated — fourteen registered workspaces, one expanded',
    task: 'Find the workspace I want and see which is active',
    width,
  });

  // The add control is the icon button in the workspace section header. Its
  // accessible name comes from `title`, and the title is "Add workspace".
  const add = page.locator('[title="Add workspace"]').first();
  if (await clickIfPresent(page, add)) {
    await page.waitForTimeout(900);
    await capture.shot({
      id: `ws-add-menu-${width}`,
      area: AREA,
      page: 'Add workspace',
      state: 'menu open — the supported ways to add one',
      task: 'Add a folder, clone a repository, or reconnect one',
      width,
    });
    await closeOverlay(page);
  } else {
    capture.gap(
      { id: `ws-add-menu-${width}`, area: AREA, page: 'Add workspace', state: 'menu', task: 'Add a workspace', width },
      'No add-workspace control was found in the sidebar.',
    );
  }

  const row = workspaceRow(page, 'CSV Summary Resilience 01');
  if (await row.isVisible().catch(() => false)) {
    await row.click({ button: 'right' }).catch(() => undefined);
    await page.waitForTimeout(900);
    await capture.shot({
      id: `ws-context-menu-${width}`,
      area: AREA,
      page: 'Workspace menu',
      state: 'context menu on a workspace row',
      task: 'Close, reveal or change the runtime of a workspace',
      width,
    });
    await closeOverlay(page);

    await clickIfPresent(page, row);
    await page.waitForTimeout(1_400);
    await capture.shot({
      id: `ws-selected-${width}`,
      area: AREA,
      page: 'Workspace tree',
      state: 'a second workspace selected and expanded',
      task: 'Switch workspace and see its files',
      width,
    });
  } else {
    capture.gap(
      { id: `ws-context-menu-${width}`, area: AREA, page: 'Workspace menu', state: 'context menu', task: 'Act on one workspace', width },
      'No workspace row was visible to open a menu on.',
    );
  }

  await openApp(page, 'orchestrator', undefined, 'froggerneon');
  await page.waitForTimeout(2_200);
  await capture.shot({
    id: `ws-switched-orchestrator-${width}`,
    area: AREA,
    page: 'Cross-app navigation',
    state: 'switched workspace, Orchestrator opened on the new one',
    task: 'Follow an Architect milestone into its Workflow',
    width,
  });

  await openApp(page, 'architect', { projectId: 'proj_0hkazv71' });
  await page.waitForTimeout(1_800);
  await capture.shot({
    id: `ws-return-architect-${width}`,
    area: AREA,
    page: 'Cross-app navigation',
    state: 'returned to Architect on the same project',
    task: 'Get back to the project I came from',
    width,
  });

  capture.gap(
    { id: `ws-setup-progress-${width}`, area: AREA, page: 'Add workspace', state: 'folder selection, permission, setup progress, ready', task: 'Set up a new workspace', width },
    'The folder picker is a native dialog Playwright cannot drive, and setup would write to disk. Not captured.',
  );
  capture.gap(
    { id: `ws-disconnected-${width}`, area: AREA, page: 'Workspace tree', state: 'disconnected or unavailable workspace, and its recovery', task: 'Recover an unavailable workspace', width },
    'No workspace in this profile is in a disconnected state, and breaking one would change the source data.',
  );
  capture.gap(
    { id: `ws-container-runtime-${width}`, area: AREA, page: 'Workspace runtime', state: 'container and remote runtime variants', task: 'Choose where a workspace runs', width },
    'Capture ran on the host runtime. Container and remote variants need a running backend and are a platform gap.',
  );
}
