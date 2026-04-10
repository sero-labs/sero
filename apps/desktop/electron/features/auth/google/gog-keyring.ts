import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { homedir, hostname, tmpdir, userInfo } from 'node:os';
import path from 'node:path';

import {
  ACTIVE_PROFILE_ID,
  SERO_AGENT_DIR,
  SERO_FIXED_ROOT,
  SERO_HOME,
} from '@electron/platform/env';

export const GOG_DEFAULT_CLIENT = 'default';

const GOG_KEYRING_DIR = path.join(
  homedir(),
  'Library',
  'Application Support',
  'gogcli',
  'keyring',
);

export function findGogBinary(): string {
  const paths = [
    '/opt/homebrew/bin/gog',
    '/usr/local/bin/gog',
    path.join(homedir(), '.local/bin/gog'),
    path.join(homedir(), 'go/bin/gog'),
  ];
  return paths.find((p) => existsSync(p)) ?? 'gog';
}

/** Stable machine/user keyring password used by Sero. */
export function deriveKeyringPassword(): string {
  const host = hostname();
  let uid: string;
  try {
    uid = String(userInfo().uid);
  } catch {
    uid = 'unknown';
  }
  return crypto.createHash('sha256')
    .update(`sero-google-keyring:${host}:${uid}`)
    .digest('hex')
    .slice(0, 32);
}

/** Buggy profile-scoped password used by the previous implementation. */
export function deriveProfileScopedKeyringPassword(profileAgentDir: string): string {
  const host = hostname();
  let uid: string;
  try {
    uid = String(userInfo().uid);
  } catch {
    uid = 'unknown';
  }
  return crypto.createHash('sha256')
    .update(`sero-google-keyring:${host}:${uid}:${profileAgentDir}`)
    .digest('hex')
    .slice(0, 32);
}

/** Current gogcli client bucket for the active Sero profile. */
export function getGoogleClientName(): string {
  if (path.resolve(SERO_HOME) === path.resolve(SERO_FIXED_ROOT)) {
    return GOG_DEFAULT_CLIENT;
  }
  const rawId = ACTIVE_PROFILE_ID
    ?? crypto.createHash('sha1').update(SERO_AGENT_DIR).digest('hex').slice(0, 12);
  const safeId = rawId.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return `profile-${safeId}`;
}

export function argsWithClient(clientName: string, args: string[]): string[] {
  return ['--client', clientName, ...args];
}

function gogEnv(password?: string): NodeJS.ProcessEnv {
  const extra = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(homedir(), '.local/bin'),
    path.join(homedir(), 'go/bin'),
  ];
  return {
    ...process.env,
    PATH: [...extra, process.env.PATH || ''].join(':'),
    GOG_KEYRING_PASSWORD: password ?? deriveKeyringPassword(),
  };
}

export function pipeToGog(
  args: string[],
  stdin: string,
  password?: string,
): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      findGogBinary(),
      args,
      { env: gogEnv(password), timeout: 10_000 },
      (err, stdout, stderr) => {
        if (err) {
          console.warn(
            `[google-auth] gog ${args.slice(0, 4).join(' ')} failed:`,
            stderr?.trim() || err.message,
          );
        }
        resolve({ ok: !err, out: (stdout ?? '').trim() });
      },
    );
    child.stdin?.write(stdin);
    child.stdin?.end();
    child.on('error', (e) => resolve({ ok: false, out: e.message }));
  });
}

export function gogExecWithPassword(
  args: string[],
  password: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(findGogBinary(), args, { env: gogEnv(password), timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) {
        console.warn(`[google-auth] gogExec ${args.join(' ')} failed:`, stderr?.trim() || err.message);
      }
      resolve(err ? null : (stdout ?? ''));
    });
  });
}

export function findTokenCandidateEmails(): string[] {
  try {
    const emails = new Set<string>();
    for (const entry of readdirSync(GOG_KEYRING_DIR)) {
      if (!entry.startsWith('token:')) continue;
      const email = entry.split(':').at(-1) ?? '';
      if (email.includes('@')) emails.add(email);
    }
    return [...emails];
  } catch {
    return [];
  }
}

export function parseEmailFromTokenData(tokenData: string): string | null {
  try {
    const parsed = JSON.parse(tokenData) as { email?: string };
    return typeof parsed.email === 'string' ? parsed.email : null;
  } catch {
    return null;
  }
}

export async function exportTokenForClient(
  email: string,
  password: string,
  clientName: string,
): Promise<string | null> {
  const tmpFile = path.join(
    tmpdir(),
    `sero-gog-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );

  const result = await gogExecWithPassword(
    argsWithClient(clientName, [
      'auth',
      'tokens',
      'export',
      email,
      '--out',
      tmpFile,
      '--overwrite',
    ]),
    password,
  );
  if (!result) return null;

  try {
    return readFileSync(tmpFile, 'utf8');
  } catch {
    return null;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}
