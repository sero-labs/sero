import type {
  NativeBuildContainerFallbackOptions,
  NativeBuildFailure,
  NativeBuildFailureKind,
  NativeBuildToolsRequiredMetadata,
} from './types';

export interface NativeBuildClassifierInput {
  command: string;
  args?: readonly string[];
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  platform: NodeJS.Platform;
  executable?: string;
}

interface PatternMatch {
  kind: NativeBuildFailureKind;
  executable?: string;
  patterns: readonly RegExp[];
  platforms?: readonly NodeJS.Platform[];
}

const OUTPUT_LIMIT = 320;

const PATTERN_MATCHES: readonly PatternMatch[] = [
  {
    kind: 'missing-python',
    executable: 'python',
    patterns: [
      /(?:can't|could not) find (?:any )?python/i,
      /python(?:3)?(?:\.exe)?["']? (?:is not set|not found|was not found)/i,
      /gyp ERR! find Python/i,
    ],
  },
  {
    kind: 'missing-msvc',
    executable: 'msbuild',
    platforms: ['win32'],
    patterns: [
      /visual studio (?:c\+\+ )?build tools/i,
      /could not find any visual studio installation/i,
      /msbuild(?:\.exe)?(?:["']? (?:not found|was not found)| : error)/i,
      /\bcl(?:\.exe)?["']? (?:is not recognized|not found|was not found)/i,
      /MSB8020/i,
    ],
  },
  {
    kind: 'missing-xcode-clt',
    executable: 'xcode-select',
    platforms: ['darwin'],
    patterns: [
      /xcode-select: error/i,
      /xcrun: error/i,
      /no developer tools were found/i,
      /command line tools (?:are )?(?:not installed|missing|required)/i,
      /invalid active developer path/i,
    ],
  },
  {
    kind: 'missing-make',
    executable: 'make',
    patterns: [missingExecutablePattern('make'), /make: (?:command not found|not found)/i],
  },
  {
    kind: 'missing-gcc',
    executable: 'gcc',
    patterns: [missingExecutablePattern('gcc'), /gcc: (?:command not found|not found)/i],
  },
  {
    kind: 'missing-gpp',
    executable: 'g++',
    patterns: [missingExecutablePattern('g\+\+'), /g\+\+: (?:command not found|not found)/i],
  },
  {
    kind: 'missing-clang',
    executable: 'clang',
    patterns: [missingExecutablePattern('clang'), /clang: (?:command not found|not found)/i],
  },
  {
    kind: 'node-gyp',
    executable: 'node-gyp',
    patterns: [/\bnode-gyp\b/i, /\bgyp ERR!/i, /node-pre-gyp/i],
  },
];

export function classifyNativeBuildFailure(input: NativeBuildClassifierInput): NativeBuildFailure | null {
  if (input.exitCode === 0) return null;
  const output = normalizeOutput(`${input.stdout}\n${input.stderr}`);
  if (!output && !input.executable) return null;

  const structuredMatch = classifyExecutable(input, output);
  if (structuredMatch) return structuredMatch;

  for (const candidate of PATTERN_MATCHES) {
    if (candidate.platforms && !candidate.platforms.includes(input.platform)) continue;
    if (!candidate.patterns.some((pattern) => pattern.test(output))) continue;
    return toFailure(input, candidate.kind, candidate.executable, output);
  }

  return null;
}

export function createNativeBuildToolsRequiredMetadata(
  failure: NativeBuildFailure,
  fallback: NativeBuildContainerFallbackOptions = {},
): NativeBuildToolsRequiredMetadata {
  const actions = [
    { type: 'show-install-instructions' as const, label: 'Show install instructions' },
    fallback.backend
      ? { type: 'switch-workspace-runtime' as const, label: 'Switch workspace to container runtime', backend: fallback.backend }
      : { type: 'setup-container-runtime' as const, label: 'Set up a container runtime' },
    { type: 'retry' as const, label: 'Retry after installing build tools' },
  ];

  return {
    code: 'NATIVE_BUILD_TOOLS_REQUIRED',
    failure,
    title: 'Native build tools required',
    message: 'This project needs native compiler tools. Host mode does not install compiler stacks automatically.',
    installInstructions: installInstructionsFor(failure),
    actions,
    seroInstallable: false,
  };
}

function classifyExecutable(input: NativeBuildClassifierInput, output: string): NativeBuildFailure | null {
  const executable = input.executable ?? firstCommandToken(input.command);
  const normalized = executable.toLowerCase();
  if (normalized === 'node-gyp') return toFailure(input, 'node-gyp', executable, output);
  return null;
}

function toFailure(
  input: NativeBuildClassifierInput,
  kind: NativeBuildFailureKind,
  executable: string | undefined,
  output: string,
): NativeBuildFailure {
  return {
    kind,
    platform: input.platform,
    command: [input.command, ...(input.args ?? [])].join(' ').trim(),
    executable,
    evidence: output.slice(0, OUTPUT_LIMIT),
  };
}

function installInstructionsFor(failure: NativeBuildFailure): string[] {
  if (failure.platform === 'darwin') {
    return ['Install Apple Xcode Command Line Tools with xcode-select --install, then retry.'];
  }
  if (failure.platform === 'win32') {
    return ['Install Visual Studio Build Tools with the Desktop development with C++ workload and Windows SDK, then retry.'];
  }
  if (failure.platform === 'linux') {
    return ['Install your distribution build tools package (for example build-essential on Debian/Ubuntu, base-devel on Arch, or Development Tools on Fedora/RHEL), then retry.'];
  }
  return ['Install this platform’s C/C++ compiler, make/build system, Python for node-gyp when required, and SDK headers, then retry.'];
}

function firstCommandToken(command: string): string {
  return command.trim().split(/\s+/)[0] ?? '';
}

function missingExecutablePattern(executable: string): RegExp {
  const escaped = executable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:spawn |exec: |["']?)${escaped}(?:["']?) (?:ENOENT|not found|was not found|command not found|is not recognized)`, 'i');
}

function normalizeOutput(output: string): string {
  return output.replace(/\u001b\[[0-9;]*m/g, '').trim();
}
