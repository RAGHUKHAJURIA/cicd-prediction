/**
 * @file dag-builder.ts
 * @description Builds a Directed Acyclic Graph (DAG) from the job dependency
 * declarations (`needs:`) in a NormalizedWorkflow and exposes the graph
 * algorithms that the DAG rule suite uses.
 *
 * Design principles:
 *  - Zero external dependencies — only native JS data structures.
 *  - All graph algorithms are pure functions that take the adjacency maps and
 *    return results; no mutation of the input workflow.
 *  - Works across CI systems: `Job.needs[]` is the normalised edge list.
 *
 * Terminology used throughout:
 *  - node  — a job id string
 *  - edge  — a directed dependency: A → B means "B needs A to finish first"
 *  - entry — a node with zero in-edges (no dependencies, starts immediately)
 */

import type { NormalizedWorkflow, Job } from '../models/workflow.model';
import { ArtifactType } from '../models/workflow.model';

// =============================================================================
// PUBLIC DATA STRUCTURES
// =============================================================================

/**
 * An adjacency list representation of the workflow execution DAG.
 *
 * Edges are stored in two complementary maps so every graph query is O(degree)
 * rather than O(n²):
 *  - `successors`  — for each node: which nodes depend ON it (fan-out / downstream)
 *  - `predecessors` — for each node: which nodes it depends ON (fan-in / upstream)
 */
export interface WorkflowDAG {
  /** All job ids present in the workflow. */
  nodes: Set<string>;

  /**
   * Forward adjacency: node → set of nodes that list it in their `needs`.
   * "Which jobs are unblocked when this job completes?"
   *
   * @example
   * // build → [test, lint]  means both 'test' and 'lint' need 'build'
   */
  successors: Map<string, Set<string>>;

  /**
   * Reverse adjacency: node → set of nodes it depends on.
   * "Which jobs must finish before this job starts?"
   *
   * @example
   * // deploy → [build, test]  means 'deploy' needs both 'build' and 'test'
   */
  predecessors: Map<string, Set<string>>;

  /**
   * Map of job id → Job for convenient lookup during rule analysis.
   */
  jobMap: Map<string, Job>;

  /**
   * Set of job ids that upload named artifacts (ArtifactType.UPLOAD).
   * Used by the missing-dependency-output rule.
   */
  artifactProducers: Map<string, Set<string>>;

  /**
   * Set of job ids that download named artifacts (ArtifactType.DOWNLOAD).
   * Used by the missing-dependency-output rule.
   */
  artifactConsumers: Map<string, Set<string>>;
}

/** A cycle detected in the dependency graph. */
export interface CycleReport {
  /** Ordered list of job ids forming the cycle, starting and ending at the same node. */
  cycle: string[];
}

/** Result of cycle detection across the full graph. */
export interface CycleDetectionResult {
  /** True when the graph is acyclic (no cycles found). */
  isDAG: boolean;
  /** All cycles found. Empty when isDAG === true. */
  cycles: CycleReport[];
}

/** Analysis of jobs reachable from the workflow entry points. */
export interface ReachabilityResult {
  /** Jobs that can be reached transitively from at least one entry point. */
  reachable: Set<string>;
  /** Jobs with no path from any entry point — execution islands. */
  unreachable: Set<string>;
  /** Entry point jobs (zero in-edges). */
  entryPoints: Set<string>;
}

/** Analysis of jobs that produce outputs consumed by nobody. */
export interface DeadStageResult {
  /**
   * Jobs whose artifact uploads are never downloaded by any downstream job.
   * Also includes jobs that appear to be terminal but are themselves not
   * consumed or depended-upon by any other job.
   */
  deadProducers: Array<{
    jobId: string;
    artifactName: string;
    reason: string;
  }>;

  /**
   * Terminal jobs (zero successors) that are neither deployment nor
   * notification jobs — likely forgotten stages that were never wired up.
   */
  orphanedTerminals: string[];
}

/** A cross-reference of an artifact consumed without a declared `needs` edge. */
export interface MissingOutputDependency {
  /** The consuming job that downloads the artifact. */
  consumerJobId: string;
  /** The artifact name it tries to download. */
  artifactName: string;
  /** The job that produces this artifact (if identifiable). */
  producerJobId: string | null;
  /** True if the consumer has no `needs` edge pointing at the producer. */
  missingEdge: boolean;
}

// =============================================================================
// DAG BUILDER
// =============================================================================

/**
 * Constructs the `WorkflowDAG` from a `NormalizedWorkflow`.
 *
 * Time complexity: O(J + E) where J = number of jobs, E = total dependency edges.
 */
export function buildDAG(workflow: NormalizedWorkflow): WorkflowDAG {
  const nodes = new Set<string>();
  const successors = new Map<string, Set<string>>();
  const predecessors = new Map<string, Set<string>>();
  const jobMap = new Map<string, Job>();
  const artifactProducers = new Map<string, Set<string>>();
  const artifactConsumers = new Map<string, Set<string>>();

  // ── Pass 1: register all nodes ────────────────────────────────────────────
  for (const job of workflow.jobs) {
    nodes.add(job.id);
    jobMap.set(job.id, job);
    successors.set(job.id, new Set());
    predecessors.set(job.id, new Set());
  }

  // ── Pass 2: build edges from needs[] ─────────────────────────────────────
  for (const job of workflow.jobs) {
    for (const dep of job.needs) {
      const upstreamId = dep.jobId;

      // Register the upstream node even if not explicitly declared (guards
      // against referencing a job from another file / external pipeline).
      if (!nodes.has(upstreamId)) {
        nodes.add(upstreamId);
        successors.set(upstreamId, new Set());
        predecessors.set(upstreamId, new Set());
      }

      successors.get(upstreamId)!.add(job.id);
      predecessors.get(job.id)!.add(upstreamId);
    }
  }

  // ── Pass 3: catalog artifact producers and consumers ─────────────────────
  for (const job of workflow.jobs) {
    for (const artifact of job.artifacts) {
      if (artifact.type === ArtifactType.UPLOAD) {
        if (!artifactProducers.has(job.id)) {
          artifactProducers.set(job.id, new Set());
        }
        artifactProducers.get(job.id)!.add(artifact.name);
      } else if (artifact.type === ArtifactType.DOWNLOAD) {
        if (!artifactConsumers.has(job.id)) {
          artifactConsumers.set(job.id, new Set());
        }
        artifactConsumers.get(job.id)!.add(artifact.name);
      }
    }
  }

  return { nodes, successors, predecessors, jobMap, artifactProducers, artifactConsumers };
}

// =============================================================================
// ALGORITHM 1 — CYCLE DETECTION (iterative DFS / Kahn's topological sort)
// =============================================================================

/**
 * Detects cycles in the workflow DAG using Kahn's topological sort algorithm.
 *
 * A workflow is a valid DAG if and only if a topological ordering exists.
 * Any node not included in the ordering belongs to a cycle.
 *
 * When cycles ARE found, the function additionally runs DFS path-finding to
 * reconstruct the exact cycle members for human-readable reporting.
 *
 * Time complexity: O(J + E).
 */
export function detectCycles(dag: WorkflowDAG): CycleDetectionResult {
  // Kahn's algorithm — count in-degrees
  const inDegree = new Map<string, number>();
  for (const node of dag.nodes) {
    inDegree.set(node, dag.predecessors.get(node)?.size ?? 0);
  }

  const queue: string[] = [];
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node);
  }

  let visited = 0;
  const remaining = inDegree;

  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;
    for (const successor of dag.successors.get(node) ?? []) {
      const newDeg = (remaining.get(successor) ?? 1) - 1;
      remaining.set(successor, newDeg);
      if (newDeg === 0) queue.push(successor);
    }
  }

  if (visited === dag.nodes.size) {
    return { isDAG: true, cycles: [] };
  }

  // ── Some nodes remain — reconstruct cycles via DFS ────────────────────────
  const cycleNodes = new Set<string>();
  for (const [node, deg] of remaining) {
    if (deg > 0) cycleNodes.add(node);
  }

  const cycles: CycleReport[] = [];
  const globalVisited = new Set<string>();

  for (const start of cycleNodes) {
    if (globalVisited.has(start)) continue;

    // DFS to find the cycle path
    const path: string[] = [];
    const onStack = new Set<string>();
    const dfsVisited = new Set<string>();

    const dfs = (node: string): boolean => {
      if (onStack.has(node)) {
        // We've found a back-edge — extract the cycle
        const cycleStart = path.indexOf(node);
        const cycle = path.slice(cycleStart);
        cycle.push(node); // close the cycle
        cycles.push({ cycle });
        return true;
      }
      if (dfsVisited.has(node)) return false;

      dfsVisited.add(node);
      onStack.add(node);
      path.push(node);

      for (const neighbor of dag.successors.get(node) ?? []) {
        if (!cycleNodes.has(neighbor)) continue;
        if (dfs(neighbor)) {
          globalVisited.add(node);
          break;
        }
      }

      path.pop();
      onStack.delete(node);
      return false;
    };

    dfs(start);
  }

  return { isDAG: false, cycles };
}

// =============================================================================
// ALGORITHM 2 — REACHABILITY (BFS from all entry points)
// =============================================================================

/**
 * Performs a BFS from all entry-point nodes (zero in-degree) and marks every
 * job reachable transitively from at least one entry point.
 *
 * A job is "unreachable" when it has predecessors but none of those predecessors
 * can trace back to an entry point (typical when a cycle severs connectivity,
 * or when a `needs` references a non-existent job id).
 *
 * Time complexity: O(J + E).
 */
export function analyzeReachability(dag: WorkflowDAG): ReachabilityResult {
  const entryPoints = new Set<string>();
  for (const node of dag.nodes) {
    if ((dag.predecessors.get(node)?.size ?? 0) === 0) {
      entryPoints.add(node);
    }
  }

  const reachable = new Set<string>();
  const queue = [...entryPoints];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (reachable.has(node)) continue;
    reachable.add(node);
    for (const successor of dag.successors.get(node) ?? []) {
      if (!reachable.has(successor)) {
        queue.push(successor);
      }
    }
  }

  const unreachable = new Set<string>();
  for (const node of dag.nodes) {
    if (!reachable.has(node)) unreachable.add(node);
  }

  return { reachable, unreachable, entryPoints };
}

// =============================================================================
// ALGORITHM 3 — DEAD STAGE DETECTION
// =============================================================================

/**
 * Finds jobs (stages) that are structural dead ends:
 *  1. Jobs that upload artifacts but no downstream job downloads them.
 *  2. Terminal jobs (zero successors) that have no recognizable purpose
 *     (not a deploy, notify, report, or test job).
 *
 * Time complexity: O(J × A) where A is average number of artifacts per job.
 */
export function findDeadStages(dag: WorkflowDAG): DeadStageResult {
  // Build a flat map: artifact name → producing job ids
  const artifactNameToProducer = new Map<string, string[]>();
  for (const [jobId, artifactNames] of dag.artifactProducers) {
    for (const name of artifactNames) {
      if (!artifactNameToProducer.has(name)) {
        artifactNameToProducer.set(name, []);
      }
      artifactNameToProducer.get(name)!.push(jobId);
    }
  }

  // Build flat set of all downloaded artifact names
  const allConsumedArtifacts = new Set<string>();
  for (const [, names] of dag.artifactConsumers) {
    for (const name of names) allConsumedArtifacts.add(name);
  }

  // ── Find producers whose artifacts are never consumed ─────────────────────
  const deadProducers: DeadStageResult['deadProducers'] = [];
  for (const [jobId, artifactNames] of dag.artifactProducers) {
    for (const name of artifactNames) {
      if (!allConsumedArtifacts.has(name)) {
        deadProducers.push({
          jobId,
          artifactName: name,
          reason: `Artifact '${name}' is uploaded but never downloaded by any downstream job`,
        });
      }
    }
  }

  // ── Find orphaned terminal jobs ────────────────────────────────────────────
  const purposePattern = /deploy|release|publish|notify|notification|report|test|check|lint|scan|alert|send|email/i;
  const orphanedTerminals: string[] = [];

  for (const node of dag.nodes) {
    const hasSuccessors = (dag.successors.get(node)?.size ?? 0) > 0;
    if (hasSuccessors) continue;

    const job = dag.jobMap.get(node);
    if (!job) continue;

    // A terminal node is "orphaned" if its name doesn't match any known
    // terminal-purpose pattern AND it has predecessors (i.e. it's not an entry).
    const hasPredecessors = (dag.predecessors.get(node)?.size ?? 0) > 0;
    const hasRecognizedPurpose = purposePattern.test(job.name) || purposePattern.test(job.id);

    if (hasPredecessors && !hasRecognizedPurpose) {
      orphanedTerminals.push(node);
    }
  }

  return { deadProducers, orphanedTerminals };
}

// =============================================================================
// ALGORITHM 4 — MISSING DEPENDENCY OUTPUT CROSS-REFERENCE
// =============================================================================

/**
 * Identifies jobs that download artifacts they have no explicit `needs` edge
 * to the producer for.
 *
 * This is dangerous because:
 *  - The download step may run before the upload completes (race condition).
 *  - On some CI systems this silently produces an empty artifact directory.
 *
 * Time complexity: O(J × A).
 */
export function findMissingOutputDependencies(dag: WorkflowDAG): MissingOutputDependency[] {
  const results: MissingOutputDependency[] = [];

  // Build artifact name → producing job id (first match wins for simplicity)
  const artifactNameToProducer = new Map<string, string>();
  for (const [jobId, names] of dag.artifactProducers) {
    for (const name of names) {
      if (!artifactNameToProducer.has(name)) {
        artifactNameToProducer.set(name, jobId);
      }
    }
  }

  for (const [consumerJobId, downloadedNames] of dag.artifactConsumers) {
    const consumerPredecessors = dag.predecessors.get(consumerJobId) ?? new Set<string>();

    for (const artifactName of downloadedNames) {
      const producerJobId = artifactNameToProducer.get(artifactName) ?? null;

      const missingEdge =
        producerJobId !== null && !consumerPredecessors.has(producerJobId);

      results.push({
        consumerJobId,
        artifactName,
        producerJobId,
        missingEdge,
      });
    }
  }

  return results.filter((r) => r.missingEdge);
}
