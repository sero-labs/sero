const INJECTION_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  { regex: /\bignore\s+previous\s+instructions\b/i, reason: 'prompt injection phrase detected' },
  { regex: /\bsystem:\s*you\s+are\s+now\b/i, reason: 'prompt injection phrase detected' },
  { regex: /\bimportant:\s*override\b/i, reason: 'prompt injection phrase detected' },
  { regex: /\bdeveloper:\s*override\b/i, reason: 'prompt injection phrase detected' },
];

const SECRET_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /\bsk-[A-Za-z0-9]{10,}\b/i, label: 'openai' },
  { regex: /\bghp_[A-Za-z0-9]{10,}\b/i, label: 'github' },
  { regex: /\bAKIA[0-9A-Z]{16}\b/i, label: 'aws' },
];

const EXFIL_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  { regex: /\b(?:curl|wget)\b[^\n]*\$\{?[A-Z0-9_]+\}?/i, reason: 'credential exfiltration pattern detected' },
  { regex: /\/\.ssh\/(?:id_rsa|id_ed25519|config)/i, reason: 'ssh credential path detected' },
];

const INVISIBLE_UNICODE_REGEX = /[\u200B\u200C\u200D\u202E\u2060]/;

export interface SecurityScanResult {
  action: 'allow' | 'sanitize' | 'block';
  content: string;
  reason?: string;
  warning?: string;
}

function hasForensicContext(value: string): boolean {
  return /#security-incident|prompt injection|incident|forensic|malicious|payload|detected|blocked|quoted|example|leaked|revoked|rotated|credential|secret/i.test(value)
    || value.includes('```')
    || value.split('\n').some((line) => line.trim().startsWith('>'));
}

function redactSecrets(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(new RegExp(pattern.regex.source, 'gi'), '<redacted-secret>');
  }
  redacted = redacted.replace(/\b(?:curl|wget)\b[^\n]*\$\{?[A-Z0-9_]+\}?/gi, '<redacted-exfiltration-command>');
  redacted = redacted.replace(/\/\.ssh\/(?:id_rsa|id_ed25519|config)/gi, '<redacted-ssh-path>');
  return redacted;
}

function redactInjectionPhrases(value: string): string {
  let redacted = value;
  for (const pattern of INJECTION_PATTERNS) {
    redacted = redacted.replace(pattern.regex, '<redacted-prompt-injection>');
  }
  return redacted;
}

export function scanMemoryContent(content: string): SecurityScanResult {
  if (INVISIBLE_UNICODE_REGEX.test(content)) {
    return {
      action: 'block',
      content,
      reason: 'invisible unicode detected',
    };
  }

  const forensicContext = hasForensicContext(content);
  const matchedInjection = INJECTION_PATTERNS.find((pattern) => pattern.regex.test(content));
  if (matchedInjection) {
    if (!forensicContext) {
      return { action: 'block', content, reason: matchedInjection.reason };
    }

    return {
      action: 'sanitize',
      content: redactInjectionPhrases(content),
      warning: 'prompt injection evidence stored as a redacted inert note',
    };
  }

  const matchedSecret = SECRET_PATTERNS.find((pattern) => pattern.regex.test(content))
    ?? EXFIL_PATTERNS.find((pattern) => pattern.regex.test(content));
  if (matchedSecret) {
    if (!forensicContext) {
      return {
        action: 'block',
        content,
        reason: 'credential exfiltration pattern detected',
      };
    }

    return {
      action: 'sanitize',
      content: redactSecrets(content),
      warning: 'forensic secret material stored in redacted form',
    };
  }

  return { action: 'allow', content };
}
