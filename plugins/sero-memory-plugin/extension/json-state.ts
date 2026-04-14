import { promises as fs } from 'node:fs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export async function readJsonState<T>(
  filePath: string,
  fallback: T,
): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function readJsonStateSync<T>(
  filePath: string,
  fallback: T,
): T {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJsonState(
  filePath: string,
  value: unknown,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

export function writeJsonStateSync(
  filePath: string,
  value: unknown,
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

export async function updateJsonState<T>(
  filePath: string,
  fallback: T,
  update: (state: T) => T,
): Promise<T> {
  const current = await readJsonState(filePath, fallback);
  const next = update(current);
  await writeJsonState(filePath, next);
  return next;
}

export function updateJsonStateSync<T>(
  filePath: string,
  fallback: T,
  update: (state: T) => T,
): T {
  const current = readJsonStateSync(filePath, fallback);
  const next = update(current);
  writeJsonStateSync(filePath, next);
  return next;
}
