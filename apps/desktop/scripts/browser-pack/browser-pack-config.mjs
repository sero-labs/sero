export const BROWSER_PACK_VERSION = 'browser-pack-2026-05-16';
export const BROWSER_PACK_DATE = '2026-05-16';
export const DEFAULT_BROWSER_PACK_URL_BASE = `https://github.com/sero-labs/sero/releases/download/${BROWSER_PACK_VERSION}`;

export const pins = {
  playwrightVersion: '1.57.0',
  chromiumRevision: '1200',
  chromiumVersion: '143.0.7499.4',
  ffmpegRevision: '1011',
  macFfmpegRevision: '1010',
  agentBrowserVersion: '0.27.0',
};

const chromiumCandidates = {
  darwin: [
    `chromium-${pins.chromiumRevision}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
    `chromium-${pins.chromiumRevision}/chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
    `chromium-${pins.chromiumRevision}/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
    `chromium-${pins.chromiumRevision}/chrome-mac/Chromium.app/Contents/MacOS/Google Chrome for Testing`,
    'chromium/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chromium/chrome-mac/Chromium.app/Contents/MacOS/Google Chrome for Testing',
  ],
  linux: [
    `chromium-${pins.chromiumRevision}/chrome-linux64/chrome`,
    `chromium-${pins.chromiumRevision}/chrome-linux64/chrome-wrapper`,
    `chromium-${pins.chromiumRevision}/chrome-linux/chrome`,
    `chromium-${pins.chromiumRevision}/chrome-linux/chrome-wrapper`,
    'chromium/chrome-linux64/chrome',
    'chromium/chrome-linux64/chrome-wrapper',
    'chromium/chrome-linux/chrome',
    'chromium/chrome-linux/chrome-wrapper',
  ],
  win32: [
    `chromium-${pins.chromiumRevision}/chrome-win/chrome.exe`,
    `chromium-${pins.chromiumRevision}/chrome-win64/chrome.exe`,
    'chromium/chrome-win/chrome.exe',
    'chromium/chrome-win64/chrome.exe',
  ],
};

const ffmpegCandidates = {
  'darwin-arm64': [
    `ffmpeg-${pins.ffmpegRevision}/ffmpeg-mac`,
    `ffmpeg-${pins.macFfmpegRevision}/ffmpeg-mac-arm64`,
    `ffmpeg-${pins.ffmpegRevision}/ffmpeg-mac-arm64`,
    'ffmpeg/ffmpeg-mac-arm64',
    'ffmpeg/ffmpeg-mac',
  ],
  'linux-x64': [`ffmpeg-${pins.ffmpegRevision}/ffmpeg-linux`, 'ffmpeg/ffmpeg-linux'],
  'linux-arm64': [`ffmpeg-${pins.ffmpegRevision}/ffmpeg-linux`, 'ffmpeg/ffmpeg-linux-arm64', 'ffmpeg/ffmpeg-linux'],
  'win32-x64': [`ffmpeg-${pins.ffmpegRevision}/ffmpeg-win64.exe`, 'ffmpeg/ffmpeg-win64.exe', 'ffmpeg/ffmpeg.exe'],
  'win32-arm64': [`ffmpeg-${pins.ffmpegRevision}/ffmpeg-win64.exe`, 'ffmpeg/ffmpeg-win64.exe', 'ffmpeg/ffmpeg.exe'],
};

const agentBrowserCandidates = {
  posix: ['agent-browser/bin/agent-browser'],
  win32: ['agent-browser/bin/agent-browser.cmd', 'agent-browser/bin/agent-browser'],
};

export const artifacts = [
  artifact('darwin', 'arm64', 'mac-arm64'),
  artifact('linux', 'x64', 'linux-x64'),
  artifact('linux', 'arm64', 'linux-arm64'),
  artifact('win32', 'x64', 'win-x64'),
  artifact('win32', 'arm64', 'win-arm64'),
];

export function findArtifact(platform, arch) {
  return artifacts.find((candidate) => candidate.platform === platform && candidate.arch === arch) ?? null;
}

export function artifactUrl(slug, urlBase = DEFAULT_BROWSER_PACK_URL_BASE) {
  return `${urlBase.replace(/\/$/, '')}/${slug}.tar.gz`;
}

function artifact(platform, arch, slug) {
  return {
    key: `browser-${platform}-${arch}`,
    slug,
    platform,
    arch,
    url: artifactUrl(slug),
    chromiumExecutableCandidates: chromiumCandidates[platform],
    ffmpegCandidates: ffmpegCandidates[`${platform}-${arch}`],
    agentBrowserCandidates: platform === 'win32' ? agentBrowserCandidates.win32 : agentBrowserCandidates.posix,
  };
}
