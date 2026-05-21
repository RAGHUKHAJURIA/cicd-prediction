export * from './secret-exposure.rule';
export * from './unpinned-actions.rule';
export * from './privilege-escalation.rule';
export * from './untrusted-registry.rule';
export * from './insecure-permissions.rule';

export function registerAllSecurityRules(): void {
  // importing this module already registers all rules
  // this function is a no-op but serves as documentation
  // calling this makes the intent explicit in app startup
}
