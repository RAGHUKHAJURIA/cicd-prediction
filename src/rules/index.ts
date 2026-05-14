import './security/index';
import './reliability/index';
import './performance/index';
import './maintainability/index';

export * from './types';
export * from './rule-registry';
export * from './rule-runner';
export { ruleRegistry } from './rule-registry';
export { RuleRunner } from './rule-runner';

export function registerAllRules(): void {
  const summary = require('./rule-registry').ruleRegistry.summary();
  console.log(JSON.stringify({
    event: 'rules_registered',
    total: summary.total,
    byCategory: summary.byCategory,
    timestamp: new Date().toISOString()
  }));
}

export type KnownRuleId =
  | 'security-secret-exposure'
  | 'security-unpinned-action'
  | 'security-privilege-escalation'
  | 'security-untrusted-registry'
  | 'security-insecure-permissions'
  | 'reliability-floating-docker-tag'
  | 'reliability-missing-timeout'
  | 'reliability-missing-retry'
  | 'reliability-missing-rollback'
  | 'reliability-flaky-install'
  | 'reliability-missing-healthcheck'
  | 'performance-redundant-install'
  | 'performance-missing-cache'
  | 'performance-sequential-bottleneck'
  | 'maintainability-duplicated-workflow'
  | 'maintainability-monolithic-pipeline';
