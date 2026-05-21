import { ruleRegistry } from '../rule-registry';
import { RedundantInstallRule } from './redundant-install.rule';
import { MissingCacheRule } from './missing-cache.rule';
import { SequentialBottleneckRule } from './sequential-bottleneck.rule';

export * from './redundant-install.rule';
export * from './missing-cache.rule';
export * from './sequential-bottleneck.rule';

export function registerAllPerformanceRules(): void {
  ruleRegistry.register(new RedundantInstallRule());
  ruleRegistry.register(new MissingCacheRule());
  ruleRegistry.register(new SequentialBottleneckRule());
}

registerAllPerformanceRules();
