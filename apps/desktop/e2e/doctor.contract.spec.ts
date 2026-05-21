import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp } from './helpers/electron-app';
import { createTempSeroHome, type TempSeroHome } from './helpers/seroHome';
import type { DoctorCategory, DoctorReport, DoctorStatus } from '../src/types/doctor';

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

const doctorCategories: DoctorCategory[] = [
  'system',
  'runtime',
  'node',
  'profile',
  'workspace',
  'providers',
  'plugins',
  'environment',
];
const doctorStatuses: DoctorStatus[] = ['pass', 'warn', 'fail'];
const doctorModes = ['in-app', 'safe', 'quick'];

function expectDoctorReportShape(report: DoctorReport): void {
  expect(report).toEqual(expect.objectContaining({
    schemaVersion: 1,
    timestamp: expect.any(String),
    mode: expect.any(String),
    system: expect.objectContaining({
      os: expect.any(String),
      version: expect.any(String),
      arch: expect.any(String),
    }),
    seroVersion: expect.any(String),
    runId: expect.any(String),
    profilesScanned: expect.any(Array),
    results: expect.any(Array),
    envAudit: expect.any(Object),
    durationMs: expect.any(Number),
  }));

  expect(doctorModes).toContain(report.mode);
  expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false);
  expect(report.durationMs).toBeGreaterThanOrEqual(0);

  for (const envAuditValue of Object.values(report.envAudit)) {
    expect(Array.isArray(envAuditValue)).toBe(true);
  }

  for (const profile of report.profilesScanned) {
    expect(profile).toEqual(expect.objectContaining({
      id: expect.any(String),
      pathHash: expect.any(String),
    }));
  }

  expect(report.results.length).toBeGreaterThan(0);
  for (const result of report.results) {
    expect(result).toEqual(expect.objectContaining({
      id: expect.any(String),
      category: expect.any(String),
      status: expect.any(String),
      message: expect.any(String),
      durationMs: expect.any(Number),
    }));
    expect(doctorCategories).toContain(result.category);
    expect(doctorStatuses).toContain(result.status);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    if (result.fix) {
      expect(['manual', 'command', 'repair']).toContain(result.fix.kind);
    }
    if (result.details) {
      expect(typeof result.details).toBe('object');
      expect(Array.isArray(result.details)).toBe(false);
    }
  }
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchSeroApp({
    seroHome: home.path,
    runtime: 'host',
    env: { HOME: home.path, USERPROFILE: home.path, SERO_HOST_FIRST: '1' },
  }));
});

test.afterAll(async () => {
  try {
    await closeSeroApp(app);
  } finally {
    home.cleanup();
  }
});

test.describe('doctor IPC contracts', () => {
  test('returns stable quick report shape with platform and result fields', async () => {
    const report = await page.evaluate(() => window.sero.doctor.runQuick({ runId: 'doctor-contract-quick' }));

    expectDoctorReportShape(report);
    expect(report.mode).toBe('quick');
    expect(report.runId).toBe('doctor-contract-quick');
    expect(report.system.os).toBe(await page.evaluate(() => window.sero.platform));
    expect(report.system.arch).toBe(await page.evaluate(() => window.sero.arch));
  });

  test('supports category-scoped quick reports without status coupling', async () => {
    const report = await page.evaluate(() => window.sero.doctor.runQuick({
      category: 'system',
      runId: 'doctor-contract-system',
    }));

    expectDoctorReportShape(report);
    expect(report.runId).toBe('doctor-contract-system');
    expect(report.results.every((result) => result.category === 'system')).toBe(true);
  });

  test('exposes reserved repair stub as a stable cheap contract', async () => {
    const response = await page.evaluate(() => window.sero.doctor.invokeRepair('contract-reserved-stub'));

    expect(response).toEqual(expect.objectContaining({
      status: 'skipped',
      message: expect.any(String),
    }));
  });
});
