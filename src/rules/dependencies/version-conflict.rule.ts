/**
 * @file version-conflict.rule.ts
 * @description DEP002 — Detects version conflicts across the dependency graph.
 *
 * Two types of conflicts are detected:
 *
 * Type A — Duplicate package, different resolved versions.
 *   Same package name + ecosystem appearing in the lock files with two or more
 *   distinct version strings. This can cause runtime confusion when transitive
 *   dependencies end up bundled at incompatible versions.
 *
 * Type B — Runtime engine mismatches.
 *   The package.json `engines.node` field (or Python `python_requires`) declares
 *   a required runtime version, but a CI job's container image uses an older
 *   runtime. This causes "works in CI" failures if not caught early.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow } from '../../models/workflow.model';
import { DependencyGraphBuilder, ParsedPackage } from '../../engine/dependency-graph';
import { ruleRegistry } from '../rule-registry';

// =============================================================================
// HELPERS
// =============================================================================

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

/** Extract a numeric node version from a docker image string like "node:14-alpine" → "14". */
function extractNodeVersion(image: string): string | null {
  const m = image.match(/\bnode[:\-](\d+)/i);
  return m ? m[1]! : null;
}

/** Extract a Python version from a docker image string like "python:3.8-slim" → "3.8". */
function extractPythonVersion(image: string): string | null {
  const m = image.match(/\bpython[:\-](\d+\.\d+)/i);
  return m ? m[1]! : null;
}

// =============================================================================
// RULE
// =============================================================================

export class VersionConflictRule extends BaseRule {
  id = 'dependency-version-conflict';
  name = 'Dependency Version Conflict';
  category = RuleCategory.DEPENDENCY;
  severity = RuleSeverity.HIGH;
  description =
    'Detects the same package appearing with different resolved versions across lock files, ' +
    'and runtime engine mismatches between package.json engines field and CI container images.';
  rationale =
    'Version conflicts can cause subtle runtime bugs when different parts of the application ' +
    'load incompatible versions of the same library. Engine mismatches cause CI to succeed ' +
    'while production (running a different runtime) fails.';
  references = [
    'https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json#lockfile-version',
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

    const results: RuleResult[] = [];

    // ── Type A: same package name, different versions ────────────────────────
    const groups = groupBy<ParsedPackage>(
      graph.packages,
      (p) => `${p.ecosystem}::${p.name}`,
    );

    for (const [key, pkgs] of groups) {
      const versions = [...new Set(pkgs.map((p) => p.version))];
      if (versions.length < 2) continue;

      const [, name] = key.split('::');
      const files = [...new Set(pkgs.map((p) => p.lockfile))];

      results.push(
        this.buildResult(
          {
            title: `Version conflict: '${name}' has ${versions.length} different resolved versions`,
            description:
              `Package '${name}' is resolved to different versions across the dependency tree: ` +
              `${versions.join(', ')}. This may cause runtime inconsistencies.`,
            remediation:
              `Run \`npm dedupe\` (npm) or \`yarn dedupe\` (Yarn) to resolve duplicates. ` +
              `Alternatively, add an explicit resolution in package.json:\n` +
              `"resolutions": { "${name}": "${versions[versions.length - 1]}" }`,
            evidence: `Versions found: ${versions.join(', ')} across files: ${files.join(', ')}`,
            confidence: RuleConfidence.CERTAIN,
            severity: RuleSeverity.HIGH,
            metadata: {
              packageName: name,
              conflictingVersions: versions,
              files,
            },
          },
          this.buildLocation(workflow, context, { field: files.join(', ') }),
        ),
      );
    }

    // ── Type B: engine mismatch between package.json and CI images ───────────
    try {
      const pkgJsonPath = path.join(repoRoot, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as Record<string, unknown>;
        const engines = pkgJson['engines'] as Record<string, string> | undefined;
        const requiredNode = engines?.['node'];

        if (requiredNode) {
          // Check all job container images
          for (const job of workflow.jobs) {
            const image = job.container?.image ?? null;
            if (!image) continue;

            const ciNodeVersion = extractNodeVersion(image);
            if (!ciNodeVersion) continue;

            // semver.satisfies needs a clean version — try coercing
            const cleanCiVersion = semver.coerce(ciNodeVersion)?.version;
            if (!cleanCiVersion) continue;

            if (!semver.satisfies(cleanCiVersion, requiredNode)) {
              results.push(
                this.buildResult(
                  {
                    title: `Node.js engine mismatch: CI uses ${ciNodeVersion} but package.json requires ${requiredNode}`,
                    description:
                      `The job '${job.name}' runs in a container with Node.js ${ciNodeVersion}, ` +
                      `but package.json engines.node requires '${requiredNode}'. ` +
                      `This will likely cause runtime failures.`,
                    remediation:
                      `Update the CI container image to use a Node.js version satisfying '${requiredNode}', ` +
                      `e.g. \`node:${semver.minVersion(requiredNode)?.major ?? '20'}-alpine\`.`,
                    evidence: `engines.node: "${requiredNode}", CI image: "${image}"`,
                    confidence: RuleConfidence.CERTAIN,
                    severity: RuleSeverity.HIGH,
                    metadata: {
                      requiredVersion: requiredNode,
                      ciVersion: ciNodeVersion,
                      ciImage: image,
                      jobName: job.name,
                    },
                  },
                  this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}.container.image` }),
                ),
              );
            }
          }
        }

        // Python requires check (if python_requires in setup.cfg or Pipfile)
        const pythonRequires = (pkgJson['python_requires'] as string | undefined);
        if (pythonRequires) {
          for (const job of workflow.jobs) {
            const image = job.container?.image ?? null;
            if (!image) continue;
            const ciPythonVersion = extractPythonVersion(image);
            if (!ciPythonVersion) continue;
            const cleanCiPython = semver.coerce(ciPythonVersion)?.version;
            if (!cleanCiPython || semver.satisfies(cleanCiPython, pythonRequires)) continue;

            results.push(
              this.buildResult(
                {
                  title: `Python engine mismatch: CI uses ${ciPythonVersion} but requires ${pythonRequires}`,
                  description:
                    `Job '${job.name}' uses python:${ciPythonVersion} but python_requires is '${pythonRequires}'.`,
                  remediation: `Update the CI image to a compatible Python version.`,
                  evidence: `python_requires: "${pythonRequires}", CI image: "${image}"`,
                  confidence: RuleConfidence.CERTAIN,
                  severity: RuleSeverity.MEDIUM,
                  metadata: { requiredVersion: pythonRequires, ciVersion: ciPythonVersion, ciImage: image, jobName: job.name },
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}.container.image` }),
              ),
            );
          }
        }
      }
    } catch {
      // package.json read/parse failure is non-fatal
    }

    return results;
  }
}

ruleRegistry.register(new VersionConflictRule());
