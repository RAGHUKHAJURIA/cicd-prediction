/**
 * @file rule-registry.ts
 * @description Singleton registry that holds all registered rule plugins.
 *
 * Rules self-register at module load time by calling:
 *   ruleRegistry.register(new MyRule())
 *
 * at the bottom of their rule file. The application imports the singleton
 * `ruleRegistry` everywhere; rule files are imported once to trigger registration.
 *
 * Design:
 *  - Backed by a Map<string, Rule> for O(1) get/has.
 *  - getAll() / getByCategory() sort deterministically.
 *  - clear() is production-guarded to prevent accidental wipes.
 */

import {
  type Rule,
  RuleCategory,
  RuleSeverity,
} from './types';

// =============================================================================
// REGISTRY SUMMARY
// =============================================================================

/** Summary statistics about the current registry state. */
export interface RuleRegistrySummary {
  total: number;
  enabled: number;
  disabled: number;
  byCategory: Record<RuleCategory, number>;
  bySeverity: Record<RuleSeverity, number>;
}

// =============================================================================
// SEVERITY ORDER (for deterministic sort)
// =============================================================================

/** Numeric rank for sorting — lower rank = displayed first (highest priority). */
const SEVERITY_RANK: Record<RuleSeverity, number> = {
  [RuleSeverity.CRITICAL]: 0,
  [RuleSeverity.HIGH]:     1,
  [RuleSeverity.MEDIUM]:   2,
  [RuleSeverity.LOW]:      3,
  [RuleSeverity.INFO]:     4,
};

// =============================================================================
// RULE REGISTRY CLASS
// =============================================================================

/**
 * Thread-safe (single-threaded Node.js) registry of all rule plugins.
 *
 * Usage:
 * ```ts
 * import { ruleRegistry } from './rule-registry';
 * ruleRegistry.register(new MyRule());
 * ```
 */
export class RuleRegistry {
  private readonly rules: Map<string, Rule> = new Map();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Add a single rule to the registry.
   *
   * @throws {Error} If a rule with the same id is already registered.
   */
  register(rule: Rule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(
        `Rule with id '${rule.id}' is already registered. Rule ids must be unique.`,
      );
    }
    this.rules.set(rule.id, rule);
  }

  /**
   * Register multiple rules at once.
   * Stops on the first duplicate (calls register() for each).
   */
  registerMany(rules: Rule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  /**
   * Remove a rule by id.
   * @returns true if found and removed, false if not found.
   */
  unregister(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  // ---------------------------------------------------------------------------
  // Retrieval
  // ---------------------------------------------------------------------------

  /** Return a rule by id, or undefined if not registered. */
  getById(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Return all registered rules as an array.
   * Sorted by: category ASC (alphabetical), then severity DESC (critical first).
   */
  getAll(): Rule[] {
    return [...this.rules.values()].sort((a, b) => {
      const catDiff = a.category.localeCompare(b.category);
      if (catDiff !== 0) return catDiff;
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    });
  }

  /**
   * Return only rules where enabled === true.
   * Sorted identically to getAll().
   */
  getAllEnabled(): Rule[] {
    return this.getAll().filter((r) => r.enabled);
  }

  /**
   * Return all rules in a specific category.
   * Sorted by severity DESC (critical first).
   */
  getByCategory(category: RuleCategory): Rule[] {
    return [...this.rules.values()]
      .filter((r) => r.category === category)
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  }

  /** Return all rules with a specific severity (any enabled state). */
  getBySeverity(severity: RuleSeverity): Rule[] {
    return [...this.rules.values()].filter((r) => r.severity === severity);
  }

  /**
   * Return rules matching ANY of the given categories.
   * Sorted by: category ASC, severity DESC.
   */
  getByCategories(categories: RuleCategory[]): Rule[] {
    const categorySet = new Set<RuleCategory>(categories);
    return [...this.rules.values()]
      .filter((r) => categorySet.has(r.category))
      .sort((a, b) => {
        const catDiff = a.category.localeCompare(b.category);
        if (catDiff !== 0) return catDiff;
        return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      });
  }

  // ---------------------------------------------------------------------------
  // Meta
  // ---------------------------------------------------------------------------

  /** Returns true if a rule with this id is registered. */
  has(ruleId: string): boolean {
    return this.rules.has(ruleId);
  }

  /** Total number of registered rules (enabled + disabled). */
  count(): number {
    return this.rules.size;
  }

  /** Number of enabled rules. */
  countEnabled(): number {
    let n = 0;
    for (const rule of this.rules.values()) {
      if (rule.enabled) n++;
    }
    return n;
  }

  /**
   * Returns a summary of the current registry state.
   * Counts are zero-initialized for all categories and severities.
   */
  summary(): RuleRegistrySummary {
    const byCategory: Record<RuleCategory, number> = {
      [RuleCategory.SECURITY]:        0,
      [RuleCategory.RELIABILITY]:     0,
      [RuleCategory.PERFORMANCE]:     0,
      [RuleCategory.MAINTAINABILITY]: 0,
      [RuleCategory.DEPENDENCY]:      0,
      [RuleCategory.DAG]:             0,
    };

    const bySeverity: Record<RuleSeverity, number> = {
      [RuleSeverity.CRITICAL]: 0,
      [RuleSeverity.HIGH]:     0,
      [RuleSeverity.MEDIUM]:   0,
      [RuleSeverity.LOW]:      0,
      [RuleSeverity.INFO]:     0,
    };

    let enabled = 0;
    let disabled = 0;

    for (const rule of this.rules.values()) {
      byCategory[rule.category]++;
      bySeverity[rule.severity]++;
      if (rule.enabled) {
        enabled++;
      } else {
        disabled++;
      }
    }

    return {
      total: this.rules.size,
      enabled,
      disabled,
      byCategory,
      bySeverity,
    };
  }

  /**
   * Remove all rules.
   *
   * **Production guard**: throws if NODE_ENV === 'production'.
   * Intended for test teardown only.
   */
  clear(): void {
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error(
        'RuleRegistry.clear() is not allowed in production. ' +
        'This method exists for test teardown only.',
      );
    }
    this.rules.clear();
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

/**
 * The application-wide singleton RuleRegistry.
 *
 * All rule files call `ruleRegistry.register(new MyRule())` at the bottom
 * of their module so they self-register on import.
 *
 * @example
 * // In any rule file:
 * import { ruleRegistry } from '../rule-registry';
 * ruleRegistry.register(new MyRule());
 */
export const ruleRegistry = new RuleRegistry();
