/**
 * Capture helpers for the agent/workspace UX audit.
 *
 * The audit photographs the shipped UI against a copy of a real profile. The
 * three app runtimes are killed before launch (`SERO_ARCHITECT=0`,
 * `SERO_ROOMS=0`, `SERO_GOALS=0`), so no owner is woken, no model is called and
 * no record is written. Every Architect, Room and Workflow page reads its data
 * from files through the host's app-state bridge, so the pages still render the
 * profile's real projects, Workflows and Rooms exactly as recorded.
 *
 * Each shot writes a register row. A row with no image keeps its reason, so an
 * unreachable state stays a visible gap instead of disappearing.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

export interface ShotMeta {
  /** Stable id, also the file name stem. */
  id: string;
  area: 'architect' | 'orchestrator' | 'rooms' | 'workspaces' | 'shell';
  page: string;
  state: string;
  /** What the user is trying to do on this screen. */
  task: string;
  /** Viewport width in CSS pixels at capture time. */
  width?: number;
}

export interface RegisterRow extends ShotMeta {
  /** `duplicate` means the state was reached but rendered a frame already held. */
  status: 'captured' | 'duplicate' | 'gap';
  file: string | null;
  /** Content hash, so two rows that photographed the same frame are visible. */
  sha1: string | null;
  /** For a duplicate, the id of the entry that owns the image. */
  sameAs?: string;
  reason: string | null;
  capturedAt: string | null;
  /** First 220 characters of the panel's visible text, to prove the frame is the right screen. */
  fingerprint: string | null;
}

export interface AuditCapture {
  shot: (meta: ShotMeta) => Promise<boolean>;
  gap: (meta: ShotMeta, reason: string) => void;
  rows: () => RegisterRow[];
  write: () => void;
  setWidth: (width: number) => Promise<void>;
}

const SETTLE_MS = 500;

export function createAuditCapture(page: Page, outDir: string, registerFile: string): AuditCapture {
  fs.mkdirSync(outDir, { recursive: true });
  const rows: RegisterRow[] = [];
  /** Image hash -> the id that owns that file. A second identical frame is not kept. */
  const seen = new Map<string, string>();
  // Seed from an earlier partial run, so re-capturing one area does not
  // republish a frame another area already holds.
  if (fs.existsSync(registerFile)) {
    try {
      const previous = JSON.parse(fs.readFileSync(registerFile, 'utf8')) as { rows?: RegisterRow[] };
      for (const row of previous.rows ?? []) {
        if (row.status === 'captured' && row.sha1 && fs.existsSync(path.join(outDir, row.file ?? ''))) {
          seen.set(row.sha1, row.id);
        }
      }
    } catch {
      seen.clear();
    }
  }

  async function fingerprint(): Promise<string> {
    const text = await page.evaluate(() => {
      const panel = document.querySelector('[data-app-panel]') ?? document.body;
      return (panel.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
    }).catch(() => '');
    return text;
  }

  async function shot(meta: ShotMeta): Promise<boolean> {
    const file = `${meta.id}.png`;
    const full = path.join(outDir, file);
    try {
      await page.waitForTimeout(SETTLE_MS);
      const mark = await fingerprint();
      await page.screenshot({ path: full, animations: 'disabled' });
      const sha1 = createHash('sha1').update(fs.readFileSync(full)).digest('hex');
      const owner = seen.get(sha1);
      // Re-capturing the same state to the same pixels is not a duplicate of
      // anything: it is this entry, captured again.
      if (owner && owner !== meta.id) {
        // The same pixels again. Keep the row so the state is still accounted
        // for, drop the file so the gallery holds one copy.
        fs.rmSync(full, { force: true });
        rows.push({
          ...meta,
          status: 'duplicate',
          file: `${owner}.png`,
          sha1,
          sameAs: owner,
          reason: `Rendered the same frame as ${owner}.`,
          capturedAt: new Date().toISOString(),
          fingerprint: mark,
        });
        return true;
      }
      seen.set(sha1, meta.id);
      rows.push({
        ...meta,
        status: 'captured',
        file,
        sha1,
        reason: null,
        capturedAt: new Date().toISOString(),
        fingerprint: mark,
      });
      return true;
    } catch (error) {
      gap(meta, `capture failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  function gap(meta: ShotMeta, reason: string): void {
    rows.push({
      ...meta,
      status: 'gap',
      file: null,
      sha1: null,
      reason,
      capturedAt: null,
      fingerprint: null,
    });
  }

  /**
   * Merge this run's rows into any register already beside the shots.
   *
   * One area can then be re-captured on its own after a selector fix, without
   * throwing away the areas that were already right. Rows from this run win;
   * rows it did not touch are kept as they were.
   */
  function write(): void {
    fs.mkdirSync(path.dirname(registerFile), { recursive: true });
    // Merge by id. Replacing a whole area instead would be wrong for a test
    // that touches several areas partially: the narrow-width pass walks all
    // four, and would discard the wide captures of three of them.
    const fresh = new Set(rows.map((row) => row.id));
    let kept: RegisterRow[] = [];
    if (fs.existsSync(registerFile)) {
      try {
        const previous = JSON.parse(fs.readFileSync(registerFile, 'utf8')) as { rows?: RegisterRow[] };
        kept = (previous.rows ?? []).filter((row) => !fresh.has(row.id));
      } catch {
        kept = [];
      }
    }
    const merged = [...kept, ...rows];
    fs.writeFileSync(registerFile, `${JSON.stringify({ version: 1, rows: merged }, null, 2)}\n`, 'utf8');
  }

  async function setWidth(width: number): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(SETTLE_MS);
  }

  return { shot, gap, rows: () => rows, write, setWidth };
}

/** Open a Sero app, optionally deep-linking through the launch-param registry. */
export async function openApp(
  page: Page,
  appId: string,
  params?: Record<string, unknown>,
  workspaceId?: string,
): Promise<boolean> {
  return page.evaluate(({ appId, params, workspaceId }) => {
    const control = window.__appControl;
    if (!control) return false;
    const registry: Map<string, Record<string, unknown>> =
      (globalThis as Record<string, unknown>).__sero_app_launch_params__ as Map<string, Record<string, unknown>>
      ?? new Map();
    (globalThis as Record<string, unknown>).__sero_app_launch_params__ = registry;
    if (params) registry.set(appId, params);
    const opened = workspaceId ? control.openApp(appId, workspaceId) : control.openApp(appId);
    if (opened && params) {
      window.dispatchEvent(new CustomEvent(`sero:app-launch:${appId}`, { detail: params }));
    }
    return opened;
  }, { appId, params, workspaceId });
}
