/**
 * @file outdated-packages.rule.ts
 * @description DEP003 — Flags packages that are 2+ major versions behind the
 * latest published version on the package registry.
 *
 * Registries queried:
 *  - npm:   https://registry.npmjs.org/{name}/latest
 *  - PyPI:  https://pypi.org/pypi/{name}/json
 *  - Maven: https://search.maven.org/solrsearch/select?...
 *
 * Performance:
 *  - npm lookups are batched in groups of 10 with 300ms between batches.
 *  - Registry responses are cached (module-level Map, TTL 5 minutes).
 *  - Each fetch has a 5-second AbortController timeout.
 *  - Dev dependencies are skipped entirely.
 */

import * as path from 'path';
import * as semver from 'semver';
import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow } from '../../models/workflow.model';
import { DependencyGraphBuilder, ParsedPackage } from '../../engine/dependency-graph';
import { fetchWithTimeout, HttpTimeoutError, HttpError } from '../../engine/http-client';
import { ruleRegistry } from '../rule-registry';

// =============================================================================
// REGISTRY CACHE
// =============================================================================

interface CacheEntry {
  version: string;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const registryCache = new Map<string, CacheEntry>();

function getCached(key: string): string | null {
  const entry = registryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    registryCache.delete(key);
    return null;
  }
  return entry.version;
}

function setCache(key: string, version: string): void {
  registryCache.set(key, { version, fetchedAt: Date.now() });
}

/** Clear the registry response cache (useful in tests). */
export function clearRegistryCache(): void {
  registryCache.clear();
}

// =============================================================================
// REGISTRY FETCHERS
// =============================================================================

async function fetchNpmLatest(name: string): Promise<string | null> {
  const cacheKey = `npm:${name}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const resp = await fetchWithTimeout(
      `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
      { timeoutMs: 5000 },
    );
    const data = await resp.json() as Record<string, unknown>;
    const version = typeof data['version'] === 'string' ? data['version'] : null;
    if (version) setCache(cacheKey, version);
    return version;
  } catch (err: unknown) {
    if (err instanceof HttpTimeoutError || (err instanceof HttpError && err.statusCode === 404)) {
      return null;
    }
    return null; // Unexpected error — skip this package
  }
}

async function fetchPypiLatest(name: string): Promise<string | null> {
  const cacheKey = `pypi:${name}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const resp = await fetchWithTimeout(
      `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
      { timeoutMs: 5000 },
    );
    const data = await resp.json() as Record<string, unknown>;
    const info = data['info'] as Record<string, unknown> | undefined;
    const version = typeof info?.['version'] === 'string' ? info['version'] : null;
    if (version) setCache(cacheKey, version);
    return version;
  } catch (err: unknown) {
    if (err instanceof HttpTimeoutError || (err instanceof HttpError && err.statusCode === 404)) {
      return null;
    }
    return null;
  }
}

async function fetchMavenLatest(name: string): Promise<string | null> {
  const cacheKey = `maven:${name}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // name format: "groupId:artifactId"
  const [groupId, artifactId] = name.split(':');
  if (!groupId || !artifactId) return null;

  try {
    const url =
      `https://search.maven.org/solrsearch/select?q=g:${encodeURIComponent(groupId)}` +
      `+AND+a:${encodeURIComponent(artifactId)}&rows=1&wt=json`;
    const resp = await fetchWithTimeout(url, { timeoutMs: 5000 });
    const data = await resp.json() as Record<string, unknown>;
    const response = data['response'] as Record<string, unknown> | undefined;
    const docs = response?.['docs'] as Record<string, unknown>[] | undefined;
    const version = typeof docs?.[0]?.['latestVersion'] === 'string'
      ? docs[0]!['latestVersion'] as string
      : null;
    if (version) setCache(cacheKey, version);
    return version;
  } catch (err: unknown) {
    if (err instanceof HttpTimeoutError || (err instanceof HttpError && err.statusCode === 404)) {
      return null;
    }
    return null;
  }
}

// =============================================================================
// BATCH HELPERS
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function batchFetchLatest(
  pkgs: ParsedPackage[],
  fetcher: (name: string) => Promise<string | null>,
  batchSize: number,
  delayMs: number,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();

  for (let i = 0; i < pkgs.length; i += batchSize) {
    const batch = pkgs.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((p) => fetcher(p.name)));
    for (let j = 0; j < batch.length; j++) {
      result.set(batch[j]!.name, results[j] ?? null);
    }
    if (i + batchSize < pkgs.length) {
      await sleep(delayMs);
    }
  }

  return result;
}

// =============================================================================
// OUTDATED DETECTION
// =============================================================================

function isMajorlyOutdated(current: string, latest: string): boolean {
  const currentClean = semver.coerce(current);
  const latestClean = semver.coerce(latest);
  if (!currentClean || !latestClean) return false;
  return latestClean.major - currentClean.major >= 2;
}

// =============================================================================
// RULE
// =============================================================================

export class OutdatedPackagesRule extends BaseRule {
  id = 'dependency-outdated-packages';
  name = 'Outdated Package (2+ Major Versions Behind)';
  category = RuleCategory.DEPENDENCY;
  severity = RuleSeverity.MEDIUM;
  description = 'Flags packages that are 2 or more major versions behind the latest published release.';
  rationale =
    'Severely outdated packages miss years of security patches, bug fixes, and performance ' +
    'improvements. A 2+ major version gap indicates the package has been neglected and likely ' +
    'contains known CVEs that have been patched in later releases.';
  references = [
    'https://docs.npmjs.com/cli/v10/commands/npm-outdated',
    'https://pypi.org/help/#versioning',
  ];

  async check(workflow: NormalizedWorkflow, context: RuleContext): Promise<RuleResult[]> {
    const repoRoot = context.repoRoot ?? path.dirname(context.filePath);
    const builder = new DependencyGraphBuilder();
    let graph;
    try {
      graph = await builder.build(repoRoot);
    } catch {
      return [];
    }

    // Filter out dev dependencies and packages without a real version
    const checkable = graph.packages.filter(
      (p) => !p.isDev && p.version !== 'unknown' && semver.coerce(p.version) !== null,
    );

    // Group by ecosystem and fetch latest versions
    const npmPkgs = checkable.filter((p) => p.ecosystem === 'npm');
    const pypiPkgs = checkable.filter((p) => p.ecosystem === 'pypi');
    const mavenPkgs = checkable.filter((p) => p.ecosystem === 'maven');

    const [npmLatest, pypiLatest, mavenLatest] = await Promise.all([
      batchFetchLatest(npmPkgs, fetchNpmLatest, 10, 300),
      batchFetchLatest(pypiPkgs, fetchPypiLatest, 10, 300),
      batchFetchLatest(mavenPkgs, fetchMavenLatest, 10, 300),
    ]);

    const allLatest = new Map<string, string | null>([...npmLatest, ...pypiLatest, ...mavenLatest]);
    const results: RuleResult[] = [];

    for (const pkg of checkable) {
      const latest = allLatest.get(pkg.name);
      if (!latest) continue;
      if (!isMajorlyOutdated(pkg.version, latest)) continue;

      const currentMajor = semver.coerce(pkg.version)?.major ?? '?';
      const latestMajor = semver.coerce(latest)?.major ?? '?';
      const majorsBehind = typeof latestMajor === 'number' && typeof currentMajor === 'number'
        ? latestMajor - currentMajor
        : '?';

      results.push(
        this.buildResult(
          {
            title: `'${pkg.name}' is ${majorsBehind} major version(s) behind (${pkg.version} → ${latest})`,
            description:
              `Package '${pkg.name}' is pinned at v${pkg.version} but the latest release is v${latest}. ` +
              `This gap indicates significant missed security patches and breaking changes.`,
            remediation:
              `Update '${pkg.name}' to the latest version. ` +
              (pkg.ecosystem === 'npm'
                ? `Run \`npm install ${pkg.name}@latest\` and commit the updated lock file.`
                : pkg.ecosystem === 'pypi'
                ? `Update requirements.txt to \`${pkg.name}==${latest}\` and regenerate the lock file.`
                : `Update the version in pom.xml to ${latest}.`),
            evidence: `Current: ${pkg.version}, Latest: ${latest}, Source: ${pkg.lockfile}`,
            confidence: RuleConfidence.CERTAIN,
            severity: RuleSeverity.MEDIUM,
            metadata: {
              packageName: pkg.name,
              currentVersion: pkg.version,
              latestVersion: latest,
              majorsBehind,
              ecosystem: pkg.ecosystem,
              lockfile: pkg.lockfile,
            },
          },
          this.buildLocation(workflow, context, { field: pkg.lockfile }),
        ),
      );
    }

    return results;
  }
}

ruleRegistry.register(new OutdatedPackagesRule());
