export * from './missing-lockfile.rule';
export * from './version-conflict.rule';
export * from './outdated-packages.rule';
export * from './vulnerable-package.rule';

/** Importing this module self-registers all 4 dependency rules into ruleRegistry. */
export function registerAllDependencyRules(): void {
  // side-effect: all rules self-register on import
}
