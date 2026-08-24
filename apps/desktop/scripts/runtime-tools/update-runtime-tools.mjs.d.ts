export function isReleaseEligible(
  releasedAt: string,
  now: Date,
  minimumReleaseAgeDays: number,
): boolean;

export function assertNoAuditRegression(
  baseline: AuditReport,
  candidate: AuditReport,
): void;

interface AuditReport {
  metadata?: {
    vulnerabilities?: Partial<Record<'critical' | 'high' | 'moderate' | 'low' | 'info', number>>;
  };
}

export function macArm64FfmpegRevision(ffmpeg: {
  revision: string;
  revisionOverrides?: Record<string, string>;
}): string;
export function recordSecurityOverrides(
  pins: { securityOverrides: Array<{ tool: string; version: string; reason: string }> },
  updates: Array<{ key: string; version: string; eligible: boolean }>,
  reason?: string,
): void;

export function validateRuntimePins(options: {
  pins: {
    policy?: { minimumReleaseAgeDays?: number };
    npm?: Record<string, {
      version: string;
      releasedAt: string;
      integrity: string;
      routineUpdates: 'patch' | 'minor';
    }>;
    container: {
      golangImage: string;
      ubuntuImage: string;
      nodeVersion: string;
      githubCliVersion: string;
      nodeSha256: Record<string, string>;
    };
    containerPolicy: {
      golang: { version: string };
    };
    containerReleasedAt?: Record<string, string>;
    hostTools?: Record<string, {
      version: string;
      releasedAt: string;
      routineUpdates: 'patch' | 'minor';
    }>;
    securityOverrides?: Array<{ tool: string; version: string; reason: string }>;
  };
  now?: Date;
  allowYoungPins?: boolean;
}): Promise<void>;
