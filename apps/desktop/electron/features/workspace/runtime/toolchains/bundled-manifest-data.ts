import type { ArtifactSpec, ManagedToolArch, ManagedToolPlatform, ToolName, ToolchainManifest } from './types';

const MANIFEST_VERSION = '2026.05.16';
const RELEASE_DATE = '2026-05-16';
const CORE_TOOLS = ['node', 'npm', 'pnpm', 'git', 'ssh', 'bash'] as const satisfies readonly ToolName[];
const SUPPORTED_TARGETS = [
  { platform: 'darwin', arch: 'arm64', slug: 'macos-arm64' },
  { platform: 'darwin', arch: 'x64', slug: 'macos-x64' },
  { platform: 'linux', arch: 'arm64', slug: 'linux-arm64' },
  { platform: 'linux', arch: 'x64', slug: 'linux-x64' },
  { platform: 'win32', arch: 'x64', slug: 'windows-x64' },
] as const satisfies readonly SupportedTarget[];

interface SupportedTarget {
  platform: ManagedToolPlatform;
  arch: ManagedToolArch;
  slug: string;
}

const MIN_VERSIONS: Record<(typeof CORE_TOOLS)[number], string> = {
  node: '22.0.0',
  npm: '10.0.0',
  pnpm: '9.0.0',
  git: '2.30.0',
  ssh: '8.0.0',
  bash: '3.2.0',
};

const PINNED_SHA256: Record<string, string> = {
  'bash-linux-arm64': '478cc6a68ef5198fbff527647753a07f1f2039e331d86a1246ac07e97de723b0',
  'bash-linux-x64': 'a686b40502d3f7d123aab13f339234cb506a13ab02e347e9172634dc3000531d',
  'bash-macos-arm64': '95388d315d2c9a8809549e80948d71184a5f743995b8b58c0cc7c330fc4567ec',
  'bash-macos-x64': 'de8bc4346d99db1b2548f777ec5a5c5a1e993067d4349f874870c08f1d9c05f5',
  'bash-windows-x64': '78b6d9d3a92767d1d5fde162055dce02e6d8a7df496dbcb85b408b8e3373b7f4',
  'git-linux-arm64': '35cbf8f69e242dcf7614488d447cf028e24bd6251e3828b77642a74264417d49',
  'git-linux-x64': '8bb7986e3ff23ec3c8dafdbed621ac6fe4a20d935cd37a6c133b7e023aa50fff',
  'git-macos-arm64': '5119bd9811458665b6dcc8f2d5f0131c3c7f960287689b8031fbd4ddc83be2f2',
  'git-macos-x64': '03d7b8c9d2c8117ff80c416a2e7f7d483b1e8c82f5546fad8cd3f1ccc39efb28',
  'git-windows-x64': '4bf11bfc98b157d51e6f7494223bdb7af9bcd9f79a03cf58d499a715d09a8e35',
  'node-linux-arm64': '0e958a7c61eb52752c64696a6b35da38be512276e47182926c096e96ae25e0bf',
  'node-linux-x64': '4c175beb78eb3ce63721df399d16c88c5c1d5f157449e43bb54e782177a66a3d',
  'node-macos-arm64': '22ab6bc9a8f566a3c4a7f0d71dc7a4e1b5985a545a7145739ccb31929d66ab4b',
  'node-macos-x64': 'd8f63452c248b969ea5ac2933fcb80569e341522db0ada7aedff4cd3c71743f0',
  'node-windows-x64': '2fa2a169efdc97ba3db9f671d71f66bdb529e801c5933c1554b4009358a0fc92',
  'npm-linux-arm64': '1a3e6d24fe00e1186859b2e45d743ff224e3eb683cb0e6ff87fcb8051042664b',
  'npm-linux-x64': '345d7b46412a51388cfa21873e5c1f36cc58d41ea01bb69f9a271469c9281298',
  'npm-macos-arm64': 'd75ef7ea84d99ff337352c1d5ce9fc41286f55982fd36dc052216235f3d10376',
  'npm-macos-x64': '7ae2f82b686d2ec7d1ec8c31dca892d7b45dc411959b8317d00d433d90f1d9d0',
  'npm-windows-x64': 'ad98a3e0d2b88fb5d6eecf0800bb260e5e1cb196c357f0e28562c3e7e6428389',
  'pnpm-linux-arm64': 'f7dce46fd8918d8a40e3bb6e67d6dd34d6f52fd618df34f3ef227ad4edc7e33c',
  'pnpm-linux-x64': '5f040cc7fd0cbb9d91c7c7cdd84cf74dd906bc2a7ea673f8fad143bd310f4952',
  'pnpm-macos-arm64': '2600317cdafac1a32d4f864357642c13549d146e6e9d8a0da1bf085d8a313371',
  'pnpm-macos-x64': 'b493964d2ee47807bf4b20fd7727338e7d997a73ce6188d92c220104e6cb40f1',
  'pnpm-windows-x64': 'c997f3e281a1213eac2e5ea00ee6cb273708f727ced85b42f40730dc40366555',
  'ssh-linux-arm64': '7f49957e4d2f479a54c382517152504875997905ebccdfb9f767e729ce64626e',
  'ssh-linux-x64': 'a2f43c0f2d8b53b7bb48c95404b6fac03410397d4b285e3fdd4c762a061840db',
  'ssh-macos-arm64': '8b545388e64477c7b0a20d13d47a7b31d418bd595f20a43d16056f724c89a05b',
  'ssh-macos-x64': '35db7f3258806050edc596d29eb33ef0fd3652d9f95f1d14160d01d2e90b719e',
  'ssh-windows-x64': '3d4b84e5853f43960d5df63ef14ca440414777586ad097375fb882f392c582e5',
};

export const bundledToolchainManifest: ToolchainManifest = {
  version: MANIFEST_VERSION,
  artifacts: Object.fromEntries(
    SUPPORTED_TARGETS.flatMap((target) => CORE_TOOLS.map((tool) => [artifactKey(tool, target), coreArtifact(tool, target)])),
  ),
};

function coreArtifact(tool: (typeof CORE_TOOLS)[number], target: SupportedTarget): ArtifactSpec {
  const key = artifactKey(tool, target);
  return {
    tool,
    platform: target.platform,
    arch: target.arch,
    url: `https://downloads.sero.ai/toolchains/${RELEASE_DATE}/${key}.tar.gz`,
    sha256: pinnedSha256(key),
    unpackTo: key,
    binPaths: { [tool]: binPath(tool, target.platform) },
    minVersion: MIN_VERSIONS[tool],
    installPolicy: 'core',
  };
}

function artifactKey(tool: ToolName, target: SupportedTarget): string {
  return `${tool}-${target.slug}`;
}

function binPath(tool: ToolName, platform: ManagedToolPlatform): string {
  if (platform !== 'win32') return 'bin/' + tool;
  if (tool === 'node') return 'bin/node.exe';
  if (tool === 'npm' || tool === 'pnpm') return 'bin/' + tool + '.cmd';
  if (tool === 'git') return 'mingw64/bin/git.exe';
  return 'usr/bin/' + tool + '.exe';
}

function pinnedSha256(key: string): string {
  const value = PINNED_SHA256[key];
  if (!value) throw new Error(`Missing toolchain digest for ${key}`);
  return value;
}
