/**
 * @file vulnerable-package.rule.ts
 * @description DEP004 — Queries the OSV.dev batch API for known CVEs in all
 * detected packages and emits findings with CVSS-based severity mapping.
 *
 * OSV batch endpoint:
 *   POST https://api.osv.dev/v1/querybatch
 *
 * Severity mapping:
 *   CVSS ≥ 7.0  → CRITICAL
 *   CVSS 4.0–6.9 → HIGH
 *   CVSS < 4.0  → MEDIUM
 *
 * Packages are sent in batches of 100 (OSV API limit), awaited sequentially
 * to avoid hammering the API.
 */

import * as path from 'path';
import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow } from '../../models/workflow.model';
import { DependencyGraphBuilder, Ecosystem } from '../../engine/dependency-graph';
import { postWithTimeout, HttpTimeoutError, HttpError } from '../../engine/http-client';
import { ruleRegistry } from '../rule-registry';

// =============================================================================
// OSV TYPES (minimal shapes we actually use)
// =============================================================================

interface OsvPackage {
  name: string;
  ecosystem: string;
}

interface OsvQuery {
  version: string;
  package: OsvPackage;
}

interface OsvEvent {
  introduced?: string;
  fixed?: string;
}

interface OsvRange {
  type: string;
  events: OsvEvent[];
}

interface OsvAffected {
  ranges?: OsvRange[];
}

interface OsvSeverityEntry {
  type: string;
  score: string;
}

interface OsvVuln {
  id: string;
  summary?: string;
  severity?: OsvSeverityEntry[];
  affected?: OsvAffected[];
  references?: Array<{ type: string; url: string }>;
}

interface OsvQueryResult {
  vulns?: OsvVuln[];
}

interface OsvBatchResponse {
  results?: OsvQueryResult[];
}

// =============================================================================
// ECOSYSTEM MAPPING
// =============================================================================

const ECOSYSTEM_MAP: Record<Ecosystem, string> = {
  npm: 'npm',
  pypi: 'PyPI',
  maven: 'Maven',
  unknown: 'unknown',
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract the CVSS v3 base score from a vector string like
 * "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" → parses the numeric
 * base score. If the score field is a plain float string, returns it directly.
 */
function parseCvssScore(scoreStr: string): number | null {
  // Sometimes it's already a plain number string e.g. "9.1"
  const asFloat = parseFloat(scoreStr);
  if (!isNaN(asFloat) && asFloat <= 10) return asFloat;

  // Try to get it from the CVSS vector — but the vector string itself doesn't
  // embed the base score directly. Return null to indicate extraction impossible.
  return null;
}

function cvssToSeverity(score: number | null): RuleSeverity {
  if (score === null) return RuleSeverity.MEDIUM;
  if (score >= 7.0) return RuleSeverity.CRITICAL;
  if (score >= 4.0) return RuleSeverity.HIGH;
  return RuleSeverity.MEDIUM;
}

function extractFixedVersion(vuln: OsvVuln): string | null {
  for (const affected of vuln.affected ?? []) {
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed) return event.fixed;
      }
    }
  }
  return null;
}

function extractCvssScore(vuln: OsvVuln): { score: number | null; vector: string | null } {
  for (const sev of vuln.severity ?? []) {
    if (sev.type === 'CVSS_V3') {
      const score = parseCvssScore(sev.score);
      return { score, vector: sev.score };
    }
  }
  return { score: null, vector: null };
}

// =============================================================================
// OSV BATCH QUERY
// =============================================================================

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const OSV_BATCH_SIZE = 100;
const OSV_TIMEOUT_MS = 10000;

async function queryOsvBatch(
  queries: OsvQuery[],
): Promise<OsvQueryResult[]> {
  try {
    const resp = await postWithTimeout(
      OSV_BATCH_URL,
      { queries },
      { timeoutMs: OSV_TIMEOUT_MS },
    );
    const data = await resp.json() as OsvBatchResponse;
    return data.results ?? [];
  } catch (err: unknown) {
    if (err instanceof HttpTimeoutError || err instanceof HttpError) {
      return [];
    }
    // Unexpected network error — return empty safely
    return [];
  }
}

// =============================================================================
// RULE
// =============================================================================

export class VulnerablePackageRule extends BaseRule {
  id = 'dependency-vulnerable-package';
  name = 'Package with Known CVE';
  category = RuleCategory.DEPENDENCY;
  severity = RuleSeverity.CRITICAL;
  description = 'Queries the OSV.dev batch API for known vulnerabilities in every detected package version.';
  rationale =
    'Dependencies with known CVEs are a direct security risk. Attackers actively scan ' +
    'public repositories for outdated, vulnerable dependencies as entry points for supply ' +
    'chain attacks, data exfiltration, and remote code execution.';
  references = [
    'https://osv.dev/',
    'https://github.com/advisories',
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

    // Build OSV query list (exclude packages with unknown versions / unknown ecosystems)
    const queryable = graph.packages.filter(
      (p) => p.version !== 'unknown' && p.ecosystem !== 'unknown',
    );

    if (queryable.length === 0) return [];

    // Send in batches of 100, awaited sequentially
    const allResults: OsvQueryResult[] = [];
    for (let i = 0; i < queryable.length; i += OSV_BATCH_SIZE) {
      const batch = queryable.slice(i, i + OSV_BATCH_SIZE);
      const queries: OsvQuery[] = batch.map((p) => ({
        version: p.version,
        package: { name: p.name, ecosystem: ECOSYSTEM_MAP[p.ecosystem] },
      }));
      const batchResults = await queryOsvBatch(queries);
      allResults.push(...batchResults);
    }

    const results: RuleResult[] = [];

    for (let i = 0; i < queryable.length; i++) {
      const pkg = queryable[i]!;
      const osvResult = allResults[i];
      const vulns = osvResult?.vulns ?? [];

      for (const vuln of vulns) {
        const { score, vector } = extractCvssScore(vuln);
        const severity = cvssToSeverity(score);
        const fixedVersion = extractFixedVersion(vuln);
        const refUrl = vuln.references?.find((r) => r.type === 'WEB' || r.type === 'ADVISORY')?.url ?? null;

        results.push(
          this.buildResult(
            {
              title: `${pkg.name}@${pkg.version} has vulnerability ${vuln.id}`,
              description:
                `${vuln.summary ?? 'A known vulnerability exists in this package version.'} ` +
                `Package: ${pkg.name} v${pkg.version}. Vulnerability: ${vuln.id}.`,
              remediation: fixedVersion
                ? `Upgrade '${pkg.name}' to v${fixedVersion} or later to resolve ${vuln.id}.`
                : `Review the ${vuln.id} advisory and upgrade '${pkg.name}' to a patched version.`,
              evidence: `${pkg.name}@${pkg.version} (${pkg.ecosystem}) — ${vuln.id}`,
              confidence: RuleConfidence.CERTAIN,
              severity,
              metadata: {
                cveId: vuln.id,
                cvssScore: score,
                cvssVector: vector,
                fixedVersion,
                referenceUrl: refUrl,
                packageName: pkg.name,
                packageVersion: pkg.version,
                ecosystem: pkg.ecosystem,
                lockfile: pkg.lockfile,
              },
            },
            this.buildLocation(workflow, context, { field: pkg.lockfile }),
          ),
        );
      }
    }

    return results;
  }
}

ruleRegistry.register(new VulnerablePackageRule());
