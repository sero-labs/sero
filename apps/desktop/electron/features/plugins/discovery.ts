/**
 * Plugin Discovery — search for public Sero plugins on GitHub and npm.
 *
 * GitHub repos are discovered via the "sero-ai-plugin" topic.
 * npm packages are discovered via the "sero-ai-plugin" keyword.
 * Results are merged by matching GitHub repo URLs in npm metadata.
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

function normalizeGitHubUrl(url: string | undefined): string | null {
  if (!url) return null;
  // Strip .git suffix and trailing slashes, lowercase for comparison
  return url
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

/**
 * Search for public Sero plugins across GitHub and npm.
 * Results are merged: if a GitHub repo matches an npm package's repository
 * URL, they are combined into a single entry with npm as the preferred
 * install source.
 */
export async function searchPlugins(query: string): Promise<DiscoveredPlugin[]> {
  const [githubRepos, npmPackages, installed] = await Promise.all([
    searchGitHub(query),
    searchNpm(query),
    listInstalledPlugins(),
  ]);

  const installedSources = new Set(installed.map((p) => p.source));
  const installedNames = new Set(installed.map((p) => p.name));

  // Index npm packages by normalized GitHub URL for merging
  const npmByRepoUrl = new Map<string, NpmPackage>();
  const npmUsed = new Set<string>();
  for (const pkg of npmPackages) {
    const repoUrl = normalizeGitHubUrl(pkg.links?.repository);
    if (repoUrl) {
      npmByRepoUrl.set(repoUrl, pkg);
    }
  }

  const results: DiscoveredPlugin[] = [];

  // Process GitHub repos first, merging with npm matches
  for (const repo of githubRepos) {
    const normalizedUrl = normalizeGitHubUrl(repo.html_url);
    const matchedNpm = normalizedUrl ? npmByRepoUrl.get(normalizedUrl) : undefined;

    if (matchedNpm) {
      npmUsed.add(matchedNpm.name);
    }

    const npmName = matchedNpm?.name ?? null;
    const installSource = npmName ? `npm:${npmName}` : `git:${repo.html_url}.git`;

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
      installed: isInstalled(installSource, npmName, installedSources, installedNames),
    });
  }

  // Add npm-only packages (not matched to a GitHub repo)
  for (const pkg of npmPackages) {
    if (npmUsed.has(pkg.name)) continue;

    const repoUrl = pkg.links?.repository ?? null;

    results.push({
      name: pkg.name,
      displayName: formatNpmName(pkg.name),
      description: pkg.description ?? '',
      author: pkg.publisher?.username ?? '',
      version: pkg.version,
      githubUrl: repoUrl,
      npmPackage: pkg.name,
      stars: 0,
      installSource: `npm:${pkg.name}`,
      installed: isInstalled(`npm:${pkg.name}`, pkg.name, installedSources, installedNames),
    });
  }

  return results;
}

// ── Helpers ────────────────────────────────────────────────

function isInstalled(
  source: string,
  npmName: string | null,
  installedSources: Set<string>,
  installedNames: Set<string>,
): boolean {
  if (installedSources.has(source)) return true;
  if (npmName && installedNames.has(npmName)) return true;
  return false;
}

function formatRepoName(name: string): string {
  return name
    .replace(/^sero-/, '')
    .replace(/-plugin$/, '')
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function formatNpmName(name: string): string {
  // Strip scope (@org/) and common prefixes/suffixes
  const bare = name.replace(/^@[^/]+\//, '');
  return formatRepoName(bare);
}
