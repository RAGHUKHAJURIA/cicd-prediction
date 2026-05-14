import { ruleRegistry } from '../rule-registry';
import { DuplicatedWorkflowRule } from './duplicated-workflow.rule';
import { MonolithicPipelineRule } from './monolithic-pipeline.rule';

export * from './duplicated-workflow.rule';
export * from './monolithic-pipeline.rule';

export function registerAllMaintainabilityRules(): void {
  ruleRegistry.register(new DuplicatedWorkflowRule());
  ruleRegistry.register(new MonolithicPipelineRule());
}

registerAllMaintainabilityRules();
