/**
 * @file missing-lockfile.rule.ts
 * @description DEP001 — Flags manifests that have no corresponding lock file.
 *
 * A missing lock file means every `npm install` / `pip install` resolves fresh
 * versions from the registry, making builds non-deterministic. Two developers
 * installing the same project on the same day may get different transitive
 * dependency trees.
 */

import * as path from 'path';
import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow } from '../../models/workflow.model';
import { DependencyGraphBuilder } from '../../engine/dependency-graph';
import { ruleRegistry } from '../rule-registry';

const REMEDIATION: Record<string, string> = {
  'package.json':
    'Run `npm install --package-lock-only` to generate package-lock.json without ' +
    'installing node_modules, then commit the lock file to version control.',
  'requirements.txt':
    'Pin all dependencies with `pip freeze > requirements-lock.txt` or use ' +
    '`pip-compile requirements.in > requirements.txt` (pip-tools) to produce a ' +
    'fully pinned requirements file.',
};

export class MissingLockfileRule extends BaseRule {
  id = 'dependency-missing-lockfile';
  name = 'Missing Dependency Lock File';
  category = RuleCategory.DEPENDENCY;
  severity = RuleSeverity.HIGH;
  description = 'Detects package manifests (package.json, requirements.txt) that have no corresponding lock file.';
  rationale =
    'Without a lock file every install resolves fresh dependency versions, making ' +
    'builds non-deterministic. Different environments may install different transitive ' +
    'dependency trees, causing "works on my machine" failures and silent security regressions.';
  references = [
    'https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json',
    'https://pip-tools.readthedocs.io/',
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

    return graph.missingLockfiles.map((manifest) => {
      const isPypi = manifest.includes('requirements');
      const severity = isPypi ? RuleSeverity.MEDIUM : RuleSeverity.HIGH;
      const remediation = REMEDIATION[manifest] ?? `Create a lock file for ${manifest}`;

      return this.buildResult(
        {
          title: `No lock file found for '${manifest}'`,
          description: this.rationale,
          remediation,
          evidence: `'${manifest}' exists but no corresponding lock file was found in the repo root`,
          confidence: RuleConfidence.CERTAIN,
          severity,
          metadata: { manifest },
        },
        this.buildLocation(workflow, context, { field: manifest }),
      );
    });
  }
}

ruleRegistry.register(new MissingLockfileRule());
