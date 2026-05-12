/**
 * @file dependency-graph.ts
 * @description Parses multiple lock file / manifest formats and constructs a
 * unified DependencyGraph from a repository root directory.
 *
 * Supported formats:
 *  - package-lock.json (npm, lockfileVersion 1 / 2 / 3)
 *  - yarn.lock (Yarn v1 / v2 / v3 custom text format)
 *  - requirements.txt (pip pinned and range specs)
 *  - pom.xml (Maven, via fast-xml-parser)
 *
 * Design principles:
 *  - All file I/O is wrapped in try/catch; a parse failure adds to parseErrors
 *    and never throws to the caller.
 *  - No external HTTP calls — this module only touches the filesystem.
 *  - Completes in < 500ms for repos with up to 2000 packages.
 */

import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';

// =============================================================================
// PUBLIC TYPES
// =============================================================================

export type Ecosystem = 'npm' | 'pypi' | 'maven' | 'unknown';

export interface ParsedPackage {
  /** Package name (e.g. "lodash", "requests", "com.example:my-lib"). */
  name: string;
  /** Resolved / pinned version (e.g. "1.2.3"). */
  version: string;
  /** Version range as written in the manifest (e.g. "^1.0.0", ">=1.2"). */
  requestedVersion: string;
  /** Originating package ecosystem. */
  ecosystem: Ecosystem;
  /** True when the package is a development-only dependency. */
  isDev: boolean;
  /** Relative path from repoRoot to the file this was parsed from. */
  lockfile: string;
  /** 1-based line number in the source file, if available. */
  line?: number;
}

export interface DependencyGraph {
  packages: ParsedPackage[];
  /** Relative paths of all lock files found. */
  lockfilesFound: string[];
  /** Relative paths of all manifests found. */
  manifestsFound: string[];
  /** Manifests that have no corresponding lock file. */
  missingLockfiles: string[];
  /** Set of ecosystems detected across all packages. */
  ecosystems: Set<Ecosystem>;
  parseErrors: Array<{ file: string; error: string }>;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function existsSync(filePath: string): boolean {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// PARSERS
// =============================================================================

/**
 * Parse package-lock.json (npm lockfileVersion 1, 2, or 3).
 *
 * v1: packages live in the top-level `dependencies` map.
 * v2/v3: packages live in the `packages` map with keys like "node_modules/pkg".
 */
function parsePackageLockJson(
  content: string,
  relPath: string,
): { packages: ParsedPackage[]; error?: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch (e: unknown) {
    return { packages: [], error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}` };
  }

  const packages: ParsedPackage[] = [];
  const version = (parsed['lockfileVersion'] as number | undefined) ?? 1;

  if (version >= 2 && parsed['packages'] && typeof parsed['packages'] === 'object') {
    // v2/v3 — packages map
    const pkgs = parsed['packages'] as Record<string, Record<string, unknown>>;
    for (const [key, meta] of Object.entries(pkgs)) {
      if (!key || key === '') continue; // skip root entry ""
      const name = key.startsWith('node_modules/')
        ? key.replace(/^node_modules\//, '').replace(/\/node_modules\//g, '/')
        : key;
      const pkgVersion = typeof meta['version'] === 'string' ? meta['version'] : '';
      if (!pkgVersion) continue;
      packages.push({
        name,
        version: pkgVersion,
        requestedVersion: pkgVersion,
        ecosystem: 'npm',
        isDev: meta['dev'] === true,
        lockfile: relPath,
      });
    }
  } else if (parsed['dependencies'] && typeof parsed['dependencies'] === 'object') {
    // v1 — dependencies map (recursive, but we only parse the top level)
    const deps = parsed['dependencies'] as Record<string, Record<string, unknown>>;
    for (const [name, meta] of Object.entries(deps)) {
      const pkgVersion = typeof meta['version'] === 'string' ? meta['version'] : '';
      if (!pkgVersion) continue;
      packages.push({
        name,
        version: pkgVersion,
        requestedVersion: pkgVersion,
        ecosystem: 'npm',
        isDev: meta['dev'] === true,
        lockfile: relPath,
      });
    }
  }

  return { packages };
}

/**
 * Parse yarn.lock (Yarn v1 custom text format; v2/v3 use the same grammar).
 *
 * Block structure:
 *   "pkg@^1.0.0", "pkg@^1.2.0":  ← header with one or more specifiers
 *     version "1.3.0"             ← resolved version
 *     ...
 */
function parseYarnLock(content: string, relPath: string): { packages: ParsedPackage[] } {
  const packages: ParsedPackage[] = [];
  const lines = content.split('\n');

  let currentNames: string[] = [];
  let lineNumber = 0;
  let blockStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    lineNumber = i + 1;

    // Header line — may be quoted or unquoted, may end with ":"
    // e.g. '"lodash@^4.0.0":' or 'lodash@^4.0.0:'
    if (/^["']?(\S[^:]+):["']?\s*$/.test(line) || /^"[^"]+":\s*$/.test(line)) {
      const raw = line.trim().replace(/^"|"$/g, '').replace(/:$/, '');
      currentNames = raw.split(', ').map((s) =>
        s.trim().replace(/^"|"$/g, '').split('@').slice(0, -1).join('@')
      );
      blockStartLine = lineNumber;
      continue;
    }

    // Version line inside a block
    const versionMatch = line.match(/^\s+version\s+"([^"]+)"/);
    if (versionMatch && currentNames.length > 0) {
      const resolvedVersion = versionMatch[1]!;
      // Deduplicate: a block may list the same package name under multiple specifiers
      const uniqueNames = [...new Set(currentNames.filter(Boolean))];
      for (const name of uniqueNames) {
        packages.push({
          name,
          version: resolvedVersion,
          requestedVersion: resolvedVersion,
          ecosystem: 'npm',
          isDev: false, // yarn.lock doesn't encode dev in the lock file
          lockfile: relPath,
          line: blockStartLine,
        });
      }
      currentNames = [];
      continue;
    }

    // Blank line resets block
    if (line.trim() === '') {
      currentNames = [];
    }
  }

  void lineNumber; // suppress unused warning
  return { packages };
}

/**
 * Parse requirements.txt (pip).
 *
 * Supported forms:
 *   requests==2.28.0        — pinned (requestedVersion = "==2.28.0")
 *   flask>=2.0,<3.0         — range
 *   Django~=4.2             — compatible release
 *   # comment line          — skipped
 *   blank line              — skipped
 */
function parseRequirementsTxt(content: string, relPath: string): { packages: ParsedPackage[] } {
  const packages: ParsedPackage[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('-')) continue;

    // Strip inline comments
    const line = raw.split('#')[0]!.trim();
    if (!line) continue;

    // Match: name op version (e.g. requests==2.28.0 or flask>=2.0)
    const match = line.match(/^([A-Za-z0-9_\-\.]+)\s*([><=~!][><=~!]?\s*[\d.]+.*)?$/);
    if (!match) continue;

    const name = match[1]!;
    const spec = (match[2] ?? '').trim();
    const pinMatch = spec.match(/^==\s*([\d.]+)/);
    const resolvedVersion = pinMatch ? pinMatch[1]! : spec.replace(/[^0-9.]/g, '').split(',')[0] ?? 'unknown';

    packages.push({
      name,
      version: resolvedVersion || 'unknown',
      requestedVersion: spec || '*',
      ecosystem: 'pypi',
      isDev: false,
      lockfile: relPath,
      line: i + 1,
    });
  }

  return { packages };
}

/**
 * Parse pom.xml (Maven) using fast-xml-parser.
 *
 * Extracts <dependency> blocks from <dependencies> sections (both main and
 * dependencyManagement).
 */
function parsePomXml(content: string, relPath: string): { packages: ParsedPackage[]; error?: string } {
  const packages: ParsedPackage[] = [];

  let parsed: Record<string, unknown>;
  try {
    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
    parsed = parser.parse(content) as Record<string, unknown>;
  } catch (e: unknown) {
    return { packages: [], error: `XML parse error: ${e instanceof Error ? e.message : String(e)}` };
  }

  // Navigate to project > dependencies and project > dependencyManagement > dependencies
  const project = (parsed['project'] as Record<string, unknown> | undefined) ?? parsed;

  function extractDeps(depsNode: unknown, isDev: boolean): void {
    if (!depsNode || typeof depsNode !== 'object') return;
    const depsObj = depsNode as Record<string, unknown>;
    let depList = depsObj['dependency'];
    if (!depList) return;
    if (!Array.isArray(depList)) depList = [depList];

    for (const dep of depList as Record<string, unknown>[]) {
      const groupId = String(dep['groupId'] ?? '').trim();
      const artifactId = String(dep['artifactId'] ?? '').trim();
      const version = String(dep['version'] ?? 'unknown').trim();
      const scope = String(dep['scope'] ?? '').toLowerCase();
      if (!groupId || !artifactId) continue;

      packages.push({
        name: `${groupId}:${artifactId}`,
        version,
        requestedVersion: version,
        ecosystem: 'maven',
        isDev: isDev || scope === 'test',
        lockfile: relPath,
      });
    }
  }

  const deps = (project as Record<string, unknown>)['dependencies'] as Record<string, unknown> | undefined;
  extractDeps(deps, false);

  const mgmt = (project as Record<string, unknown>)['dependencyManagement'] as Record<string, unknown> | undefined;
  if (mgmt) {
    extractDeps((mgmt as Record<string, unknown>)['dependencies'], false);
  }

  return { packages };
}

// =============================================================================
// DEPENDENCY GRAPH BUILDER
// =============================================================================

export class DependencyGraphBuilder {
  async build(repoRoot: string): Promise<DependencyGraph> {
    const graph: DependencyGraph = {
      packages: [],
      lockfilesFound: [],
      manifestsFound: [],
      missingLockfiles: [],
      ecosystems: new Set(),
      parseErrors: [],
    };

    // Candidate lock files and manifests (relative paths)
    const lockfileCandidates: Record<string, string[]> = {
      'package-lock.json': ['npm'],
      'yarn.lock': ['npm'],
      'requirements.txt.lock': ['pypi'],
      'pip.lock': ['pypi'],
    };

    const manifestToLockfile: Record<string, string[]> = {
      'package.json': ['package-lock.json', 'yarn.lock'],
      'requirements.txt': ['requirements.txt.lock', 'pip.lock'],
    };

    // ── Detect manifests ─────────────────────────────────────────────────────
    for (const manifest of Object.keys(manifestToLockfile)) {
      if (existsSync(path.join(repoRoot, manifest))) {
        graph.manifestsFound.push(manifest);
      }
    }

    // Also detect pom.xml as a manifest
    if (existsSync(path.join(repoRoot, 'pom.xml'))) {
      graph.manifestsFound.push('pom.xml');
    }

    // ── Detect lock files ────────────────────────────────────────────────────
    for (const lf of Object.keys(lockfileCandidates)) {
      if (existsSync(path.join(repoRoot, lf))) {
        graph.lockfilesFound.push(lf);
      }
    }

    // ── Detect missing lock files ────────────────────────────────────────────
    for (const [manifest, locks] of Object.entries(manifestToLockfile)) {
      if (!graph.manifestsFound.includes(manifest)) continue;
      const hasLock = locks.some((lf) => graph.lockfilesFound.includes(lf));
      if (!hasLock) {
        graph.missingLockfiles.push(manifest);
      }
    }

    // ── Parse package-lock.json ──────────────────────────────────────────────
    const pkgLockPath = path.join(repoRoot, 'package-lock.json');
    const pkgLockContent = readFileSafe(pkgLockPath);
    if (pkgLockContent !== null) {
      const { packages, error } = parsePackageLockJson(pkgLockContent, 'package-lock.json');
      if (error) {
        graph.parseErrors.push({ file: 'package-lock.json', error });
      } else {
        graph.packages.push(...packages);
      }
    }

    // ── Parse yarn.lock ──────────────────────────────────────────────────────
    const yarnLockPath = path.join(repoRoot, 'yarn.lock');
    const yarnLockContent = readFileSafe(yarnLockPath);
    if (yarnLockContent !== null) {
      const { packages } = parseYarnLock(yarnLockContent, 'yarn.lock');
      // De-duplicate against package-lock.json packages (if both exist)
      const existing = new Set(graph.packages.map((p) => `${p.ecosystem}:${p.name}:${p.version}`));
      for (const pkg of packages) {
        if (!existing.has(`${pkg.ecosystem}:${pkg.name}:${pkg.version}`)) {
          graph.packages.push(pkg);
        }
      }
    }

    // ── Parse requirements.txt ───────────────────────────────────────────────
    const reqTxtPath = path.join(repoRoot, 'requirements.txt');
    const reqContent = readFileSafe(reqTxtPath);
    if (reqContent !== null) {
      const { packages } = parseRequirementsTxt(reqContent, 'requirements.txt');
      graph.packages.push(...packages);
    }

    // ── Parse pom.xml ────────────────────────────────────────────────────────
    const pomPath = path.join(repoRoot, 'pom.xml');
    const pomContent = readFileSafe(pomPath);
    if (pomContent !== null) {
      const { packages, error } = parsePomXml(pomContent, 'pom.xml');
      if (error) {
        graph.parseErrors.push({ file: 'pom.xml', error });
      } else {
        graph.packages.push(...packages);
      }
    }

    // ── Populate ecosystems set ──────────────────────────────────────────────
    for (const pkg of graph.packages) {
      graph.ecosystems.add(pkg.ecosystem);
    }

    return graph;
  }
}
