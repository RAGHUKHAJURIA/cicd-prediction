export * from './cyclic-dependency.rule';
export * from './unreachable-job.rule';
export * from './dead-stage.rule';
export * from './missing-dependency-output.rule';

/** Importing this module self-registers all 4 DAG rules into ruleRegistry. */
export function registerAllDagRules(): void {
  // side-effect: all rules self-register on import
}
