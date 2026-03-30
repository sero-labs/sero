/**
 * Plugin Discovery — search for public Sero plugins on GitHub and npm.
 *
 * GitHub repos are discovered via the "sero-ai-plugin" topic.
 * npm packages are discovered via the "sero-ai-plugin" keyword.
 * Results are merged by matching GitHub repos referenced in npm metadata.
 */

import type { DiscoveredPlugin } from '@sero/common';
import { listInstalledPlugins } from './manager';

const GITHUB_TOPIC = 'sero-ai-plugin';
const NPM_KEYWORD = 'sero-ai-plugin';

// ── GitHub types ───────────────────────────────────────────

interface GitHubRepo {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  owner: { login: string };
}

interface GitHubSearchResponse {
  items: GitHubRepo[];
}

// ── npm types ──────────────────────────────────────────────

interface NpmPackage {
  name: string;
  version: string;
  description?: string;
  links?: { repository?: string; npm?: string };
  publisher?: { username: string };
  keywords?: string[];
}

interface NpmSearchResponse {
  objects: Array<{ package: NpmPackage }>;
}

// ── Search functions ───────────────────────────────────────

async function searchGitHub(query: string): Promise<GitHubRepo[]> {
  const q = query
    ? `topic:${GITHUB_TOPIC} ${query} in:name,description`
    : `topic:${GITHUB_TOPIC}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=30`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Sero-Desktop',
    },
  });

  if (!res.ok) {
    console.warn(`[plugin-discovery] GitHub search failed: ${res.status} ${res.statusText}`);
    return [];
  }

  const data = (await res.json()) as GitHubSearchResponse;
  return data.items ?? [];
}

async function searchNpm(query: string): Promise<NpmPackage[]> {
  const text = query
    ? `keywords:${NPM_KEYWORD} ${query}`
    : `keywords:${NPM_KEYWORD}`;
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(text)}&size=30`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    console.warn(`[plugin-discovery] npm search failed: ${res.status} ${res.statusText}`);
    return [];
  }

  const data = (await res.json()) as NpmSearchResponse;
  return data.objects?.map((o) => o.package) ?? [];
}

// ── Merge & deduplicate ────────────────────────────────────

function extractGitHubRepoKey(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = value
    .trim()
    .replace(/^git\+/, '')
    .replace(/^git:(?=(?:https?:\/\/github\.com\/|git@github\.com:))/i, '')
    .replace(/^github:/i, 'https://github.com/')
    .replace(/^git@github\.com:/i, 'https://github.com/')
    .replace(/^ssh:\/\/git@github\.com\//i, 'https://github.com/');

  if (!normalized) return null;

  try {
    const candidate = normalized.includes('://') ? normalized : `https://${normalized.replace(/^\/+/, '')}`;
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'github.com' && hostname !== 'www.github.com') {
      return null;
    }

    const segments = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    const [owner, repo] = segments;
    if (!owner || !repo) return null;

    return `${owner}/${repo.replace(/\.git$/i, '')}`.toLowerCase();
  } catch {
    const match = normalized.match(
      /^(?:github\.com\/)?([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/?#].*)?$/i,
    );
    if (!match) return null;
    return `${match[1]}/${match[2]}`.toLowerCase();
  }
}

function toGitHubRepoUrl(repoKey: string | null): string | null {
  return repoKey ? `https://github.com/${repoKey}` : null;
}

function extractNpmPackageName(source: string): string | null {
  if (!source.startsWith('npm:')) return null;

  const spec = source.slice(4).trim();
  if (!spec) return null;

  if (spec.startsWith('@')) {
    const scopeSeparator = spec.indexOf('/');
    if (scopeSeparator === -1) return null;
    const versionSeparator = spec.indexOf('@', scopeSeparator + 1);
    return (versionSeparator === -1 ? spec : spec.slice(0, versionSeparator)).trim() || null;
  }

  const versionSeparator = spec.indexOf('@');
  return (versionSeparator === -1 ? spec : spec.slice(0, versionSeparator)).trim() || null;
}

/**
 * Search for public Sero plugins across GitHub and npm.
 * Results are merged: if a GitHub repo matches exactly one npm package's
 * repository URL, they are combined into a single entry with npm as the
 * preferred install source.
 */
export async function searchPlugins(query: string): Promise<DiscoveredPlugin[]> {
  const [githubRepos, npmPackages, installed] = await Promise.all([
    searchGitHub(query),
    searchNpm(query),
    listInstalledPlugins(),
  ]);

  const installedSources = new Map(installed.map((plugin) => [plugin.source, plugin.id]));
  const installedNpmPackages = new Map<string, string>();
  const installedGitHubRepos = new Map<string, string>();

  for (const plugin of installed) {
    const npmPackage = extractNpmPackageName(plugin.source);
    if (npmPackage && !installedNpmPackages.has(npmPackage)) {
      installedNpmPackages.set(npmPackage, plugin.id);
    }

    const repoKey = extractGitHubRepoKey(plugin.source);
    if (repoKey && !installedGitHubRepos.has(repoKey)) {
      installedGitHubRepos.set(repoKey, plugin.id);
    }
  }

  // Index npm packages by normalized GitHub repo for merging.
  // If multiple npm packages point at the same repo, leave them as npm-only
  // results rather than merging the repo with an arbitrary package.
  const npmByRepoKey = new Map<string, NpmPackage[]>();
  const npmUsed = new Set<string>();
  for (const pkg of npmPackages) {
    const repoKey = extractGitHubRepoKey(pkg.links?.repository);
    if (!repoKey) continue;
    const existing = npmByRepoKey.get(repoKey) ?? [];
    existing.push(pkg);
    npmByRepoKey.set(repoKey, existing);
  }

  const results: DiscoveredPlugin[] = [];

  // Process GitHub repos first, merging with npm matches when unambiguous.
  for (const repo of githubRepos) {
    const repoKey = extractGitHubRepoKey(repo.html_url);
    const matchedPackages = repoKey ? (npmByRepoKey.get(repoKey) ?? []) : [];
    const matchedNpm = matchedPackages.length === 1 ? matchedPackages[0] : undefined;

    if (matchedNpm) {
      npmUsed.add(matchedNpm.name);
    }

    const npmName = matchedNpm?.name ?? null;
    const installSource = npmName ? `npm:${npmName}` : `git:${repo.html_url}.git`;
    const installedPluginId = getInstalledPluginId({
      source: installSource,
      npmPackage: npmName,
      repoKey,
      installedSources,
      installedNpmPackages,
      installedGitHubRepos,
    });

    results.push({
      name: npmName ?? repo.full_name,
      displayName: formatRepoName(repo.name),
      description: repo.description ?? matchedNpm?.description ?? '',
      author: repo.owner.login,
      version: matchedNpm?.version ?? null,
      githubUrl: repo.html_url,
      npmPackage: npmName,
      stars: repo.stargazers_count,
      installSource,
      installed: installedPluginId !== null,
      installedPluginId,
    });
  }

  // Add npm-only packages (not matched to a GitHub repo)
  for (const pkg of npmPackages) {
    if (npmUsed.has(pkg.name)) continue;

    const repoKey = extractGitHubRepoKey(pkg.links?.repository);

    const installSource = `npm:${pkg.name}`;
    const installedPluginId = getInstalledPluginId({
      source: installSource,
      npmPackage: pkg.name,
      repoKey,
      installedSources,
      installedNpmPackages,
      installedGitHubRepos,
    });

    results.push({
      name: pkg.name,
      displayName: formatNpmName(pkg.name),
      description: pkg.description ?? '',
      author: pkg.publisher?.username ?? '',
      version: pkg.version,
      githubUrl: toGitHubRepoUrl(repoKey),
      npmPackage: pkg.name,
      stars: 0,
      installSource,
      installed: installedPluginId !== null,
      installedPluginId,
    });
  }

  return results;
}

// ── Helpers ────────────────────────────────────────────────

function getInstalledPluginId({
  source,
  npmPackage,
  repoKey,
  installedSources,
  installedNpmPackages,
  installedGitHubRepos,
}: {
  source: string;
  npmPackage: string | null;
  repoKey: string | null;
  installedSources: Map<string, string>;
  installedNpmPackages: Map<string, string>;
  installedGitHubRepos: Map<string, string>;
}): string | null {
  return installedSources.get(source)
    ?? (npmPackage ? installedNpmPackages.get(npmPackage) : null)
    ?? (repoKey ? installedGitHubRepos.get(repoKey) : null)
    ?? null;
}

function formatRepoName(name: string): string {
  return name
    .replace(/^sero-/, '')
    .replace(/-plugin$/, '')
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatNpmName(name: string): string {
  // Strip scope (@org/) and common prefixes/suffixes
  const bare = name.replace(/^@[^/]+\//, '');
  return formatRepoName(bare);
}
