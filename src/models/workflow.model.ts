/**
 * @file workflow.model.ts
 * @description Core normalized data model for the CI/CD Reliability Intelligence Platform.
 *
 * Every parser (GitHub Actions, GitLab CI, Dockerfile, Kubernetes, Jenkinsfile)
 * translates its native format into these types. The rule engine in Phase 2
 * operates entirely on these types.
 *
 * Design Principles:
 *  - All enum types use TypeScript `enum` for exhaustiveness checking.
 *  - No `any` types anywhere — every field is fully typed.
 *  - Every interface carries JSDoc comments describing its purpose.
 *  - Type guards are provided for the two most risk-critical runtime checks.
 */

// =============================================================================
// ENUMS
// =============================================================================

/**
 * The originating CI/CD system or IaC format that produced this workflow.
 * Used by the rule engine and analytics to apply system-specific rules.
 */
export enum WorkflowSource {
  GITHUB_ACTIONS = "GITHUB_ACTIONS",
  GITLAB_CI = "GITLAB_CI",
  JENKINS = "JENKINS",
  DOCKERFILE = "DOCKERFILE",
  KUBERNETES = "KUBERNETES",
  HELM = "HELM",
  TERRAFORM = "TERRAFORM",
}

/**
 * The type of executable unit inside a Job.
 * Maps to: `run:` in GitHub Actions, `script:` in GitLab CI,
 * `sh` steps in Jenkins, plugin steps in other systems.
 */
export enum StepType {
  /** A raw shell command string (e.g. `run: npm test`). */
  RUN = "RUN",
  /** A reusable action reference (e.g. `uses: actions/checkout@v3`). */
  ACTION = "ACTION",
  /** An inline multi-line script block. */
  SCRIPT = "SCRIPT",
  /** A CI system plugin or integration step (e.g. Jenkins plugin). */
  PLUGIN = "PLUGIN",
  /** A Docker container invocation step. */
  DOCKER = "DOCKER",
}

/**
 * The origin of a secret value discovered during parsing.
 * HARDCODED carries the highest risk; VAULT/SSM are lowest.
 */
export enum SecretSource {
  /** Secret is read from a process environment variable. */
  ENV = "ENV",
  /** Secret is referenced via the CI secrets context (e.g. `${{ secrets.TOKEN }}`). */
  SECRETS_CONTEXT = "SECRETS_CONTEXT",
  /** Secret is fetched from HashiCorp Vault at runtime. */
  VAULT = "VAULT",
  /** Secret is fetched from AWS Systems Manager Parameter Store. */
  SSM = "SSM",
  /** Secret literal value is embedded directly in the pipeline file — HIGH RISK. */
  HARDCODED = "HARDCODED",
  /** Secret source could not be determined. */
  UNKNOWN = "UNKNOWN",
}

/**
 * Describes the precision of an action's version reference.
 * SHA is the only truly pinned (immutable) reference type.
 */
export enum ActionRefType {
  /** A full commit SHA. Immutable — safest. */
  SHA = "SHA",
  /** A semantic version tag (e.g. `v3`). Mutable if the tag moves. */
  TAG = "TAG",
  /** A branch name (e.g. `main`). Highly mutable — unsafe. */
  BRANCH = "BRANCH",
  /** A floating reference that cannot be categorized. */
  FLOATING = "FLOATING",
}

/** Describes where a job's runner is provisioned. */
export enum RunnerType {
  /** Managed runner provided by GitHub (e.g. `ubuntu-latest`). */
  GITHUB_HOSTED = "GITHUB_HOSTED",
  /** Runner registered and maintained by the organization. */
  SELF_HOSTED = "SELF_HOSTED",
  /** Job runs inside a Docker container on the runner host. */
  DOCKER = "DOCKER",
  /** Runner type could not be determined from available labels. */
  UNKNOWN = "UNKNOWN",
}

/** The event type that initiates a workflow run. */
export enum TriggerType {
  PUSH = "PUSH",
  PULL_REQUEST = "PULL_REQUEST",
  SCHEDULE = "SCHEDULE",
  MANUAL = "MANUAL",
  API = "API",
  TAG = "TAG",
  MERGE_REQUEST = "MERGE_REQUEST",
  PIPELINE = "PIPELINE",
}

/** The type of an artifact operation in a job. */
export enum ArtifactType {
  UPLOAD = "UPLOAD",
  DOWNLOAD = "DOWNLOAD",
  CACHE = "CACHE",
}

/**
 * The type of conditional expression applied to a job or step.
 * Maps to the native syntax of each CI system.
 */
export enum ConditionType {
  /** GitHub Actions `if:` field. */
  IF = "IF",
  /** GitLab CI `rules:` block. */
  RULES = "RULES",
  /** Jenkins declarative `when {}` block. */
  WHEN = "WHEN",
  /** GitLab CI legacy `only:` keyword. */
  ONLY = "ONLY",
  /** GitLab CI legacy `except:` keyword. */
  EXCEPT = "EXCEPT",
}

/** The permission access level granted to a workflow scope. */
export enum PermissionAccess {
  READ = "READ",
  WRITE = "WRITE",
  NONE = "NONE",
}

/** Severity levels for parser diagnostic messages. */
export enum DiagnosticSeverity {
  ERROR = "ERROR",
  WARNING = "WARNING",
  INFO = "INFO",
}

// =============================================================================
// SUB-TYPES
// =============================================================================

/**
 * A reference to an environment variable with heuristic-derived metadata
 * about whether it likely contains a secret value.
 */
export interface EnvVar {
  /** The environment variable key (name). */
  key: string;
  /**
   * The resolved value string, or null if dynamic / not statically knowable.
   */
  value: string | null;
  /**
   * True when the value contains a CI expression such as `${{ github.sha }}`
   * or `${CI_COMMIT_SHA}`.
   */
  isDynamic: boolean;
  /**
   * True when the key name matches a heuristic pattern for secrets
   * (TOKEN, SECRET, KEY, PASSWORD, CREDENTIAL, API_KEY).
   */
  containsSecret: boolean;
}

/**
 * Parsed representation of an action `uses:` field, decomposed into
 * owner, repository, and version reference components.
 *
 * @example
 * // uses: actions/checkout@v3
 * // → { owner: "actions", repo: "checkout", ref: "v3", refType: TAG }
 */
export interface ActionRef {
  /** GitHub organization or user that owns the action repository. */
  owner: string;
  /** Repository name of the action. */
  repo: string;
  /** Raw version string after the `@` symbol (branch, tag, or SHA). */
  ref: string;
  /** Classification of the reference precision. Only SHA is truly immutable. */
  refType: ActionRefType;
  /**
   * True when the action's owner differs from the consuming repository's org.
   * Third-party actions carry supply chain risk.
   */
  isThirdParty: boolean;
  /**
   * True only when `refType === ActionRefType.SHA`.
   * Only a full commit SHA guarantees the action content cannot silently change.
   */
  isPinned: boolean;
}

/**
 * Parsed representation of a Docker image reference, decomposed into its
 * registry, image name, tag, and digest components.
 *
 * @example
 * // ghcr.io/org/app:1.2.3@sha256:abc123
 * // → { registry: "ghcr.io", image: "org/app", tag: "1.2.3", digest: "sha256:abc123" }
 */
export interface DockerImageRef {
  /**
   * The registry hostname, or null if the Docker Hub default registry is implied.
   * Examples: "ghcr.io", "gcr.io", "registry.gitlab.com".
   */
  registry: string | null;
  /**
   * The image name, including namespace (e.g. `library/node`, `org/service`).
   */
  image: string;
  /**
   * The image tag, or null if no tag was specified.
   * Absence of a tag implies `latest` — a floating reference.
   */
  tag: string | null;
  /**
   * The content-addressable digest (e.g. `sha256:abc...`), or null if not pinned.
   * Only a digest guarantees the exact image layers cannot change.
   */
  digest: string | null;
  /**
   * True when the tag is "latest", empty, or absent.
   * Floating images can change between pipeline runs, causing irreproducibility.
   */
  isFloating: boolean;
  /**
   * True only when a content digest is present.
   * Only a digest provides true immutability.
   */
  isPinned: boolean;
}

/**
 * A reference to a secret value used within a pipeline.
 * The `source` field classifies the origin and associated risk level.
 */
export interface SecretRef {
  /** The logical name of the secret (e.g. `NPM_TOKEN`, `DEPLOY_KEY`). */
  name: string;
  /** How/where the secret is sourced. HARDCODED is the highest risk. */
  source: SecretSource;
  /**
   * The literal value, populated ONLY when `source === SecretSource.HARDCODED`.
   * Must be redacted in any logging or serialization path.
   */
  value: string | null;
  /**
   * True when the secret is found in a position that risks exposure
   * (e.g., echoed in a `run:` step or passed as a plain env var).
   */
  isExposed: boolean;
}

/** Specifies where and how a job's runner is provisioned. */
export interface RunnerSpec {
  /** Broad classification of the runner provisioning model. */
  type: RunnerType;
  /**
   * Raw label strings from `runs-on:` (GitHub) or `tags:` (GitLab).
   * Multiple labels are ANDed when matching self-hosted runners.
   */
  labels: string[];
  /**
   * The Docker image used as the execution environment, if applicable.
   * Populated for `container:` jobs and GitLab `image:` jobs.
   */
  image: string | null;
}

/**
 * Specification of a Docker container used as the execution environment
 * for a job or service sidecar.
 */
export interface ContainerSpec {
  /** The raw image string as written in config (e.g. `node:20-alpine`). */
  image: string;
  /** Parsed decomposition of the image reference for risk analysis. */
  imageRef: DockerImageRef;
  /** Environment variables injected into the container. */
  env: EnvVar[];
  /** Ports exposed by the container. */
  ports: number[];
  /** Volume mounts in the form `host-path:container-path`. */
  volumes: string[];
}

/**
 * A service container that runs alongside a job, providing backing services
 * such as databases, caches, or message queues.
 *
 * @example
 * // services:
 * //   postgres:
 * //     image: postgres:15
 */
export interface ServiceContainer {
  /** The logical service name (used as the network hostname within the job). */
  name: string;
  /** Full container image and configuration. */
  container: ContainerSpec;
}

/**
 * A conditional expression that gates whether a job or step executes.
 * Each CI system uses different syntax; `type` records which syntax was used.
 */
export interface Condition {
  /**
   * The raw conditional expression as written in the source file.
   * @example `${{ github.event_name == 'push' }}`
   */
  expression: string;
  /** The CI-system-specific syntax used to express this condition. */
  type: ConditionType;
}

/**
 * A declaration of a dependency between two Jobs, encoding one edge in
 * the workflow's execution DAG.
 */
export interface Dependency {
  /** The `id` of the upstream Job that must succeed before this Job starts. */
  jobId: string;
  /**
   * Specific named outputs from the upstream job that this job requires.
   * An empty array means only job completion is needed, not specific outputs.
   */
  outputs: string[];
}

/**
 * A matrix build strategy that fans a single job into multiple parallel runs,
 * each with a different combination of variable values.
 */
export interface MatrixStrategy {
  /**
   * The matrix variable definitions.
   * @example { "node-version": ["16", "18", "20"], "os": ["ubuntu", "windows"] }
   */
  matrix: Record<string, string[]>;
  /**
   * If true, all in-progress matrix jobs are cancelled when any one fails.
   * Maps to `fail-fast:` in GitHub Actions.
   */
  failFast: boolean;
  /**
   * Maximum number of matrix jobs to run concurrently.
   * Null means unlimited concurrency.
   */
  maxParallel: number | null;
}

/**
 * A retry policy applied when a job fails.
 * Maps to `retry:` in GitLab CI.
 */
export interface RetryStrategy {
  /** Maximum number of total attempts (including the initial run). */
  maxAttempts: number;
  /** If true, retries on any failure. False means retry only on specific conditions. */
  onFailure: boolean;
}

/**
 * Specifies an artifact produced or consumed by a job, or a cache entry.
 * Maps to `artifacts:` in GitLab CI and `actions/upload-artifact` in GitHub Actions.
 */
export interface ArtifactSpec {
  /** A human-readable name for the artifact. */
  name: string;
  /** Filesystem glob patterns defining what to include in the artifact. */
  paths: string[];
  /**
   * Retention duration before expiry, or null if no expiry is configured.
   * Format varies by system: GitLab uses `"1 week"`, GitHub uses ISO 8601 duration.
   */
  expireIn: string | null;
  /** Whether this entry represents an upload, download, or cache operation. */
  type: ArtifactType;
}

/**
 * A workflow trigger event defining what events cause the workflow to run
 * and under what branch/path/schedule conditions.
 */
export interface Trigger {
  /** The event type that initiates this trigger. */
  type: TriggerType;
  /**
   * Branch name patterns that scope this trigger.
   * Supports glob patterns (e.g. `["release/**", "main"]`).
   * Empty array means the trigger applies to all branches.
   */
  branches: string[];
  /**
   * Filepath patterns that scope this trigger (path filters).
   * Empty array means the trigger applies regardless of changed paths.
   */
  paths: string[];
  /**
   * A cron expression for SCHEDULE triggers; null for all other trigger types.
   * @example "0 2 * * 1" — Monday at 02:00 UTC
   */
  schedule: string | null;
}

/**
 * A permission declaration granting an access level to a specific workflow
 * scope at the GITHUB_TOKEN level.
 * Maps to the `permissions:` block in GitHub Actions.
 */
export interface Permission {
  /**
   * The name of the permission scope.
   * @example "contents", "packages", "id-token"
   */
  scope: string;
  /** The level of access granted to this scope. */
  access: PermissionAccess;
}

/**
 * Aggregate metadata about a NormalizedWorkflow, computed during parsing.
 * Enables fast querying and dashboard display without deep traversal.
 */
export interface WorkflowMetadata {
  /** The workflow name as declared in the source file, or null if unnamed. */
  name: string | null;
  /** A human-readable description from the source file, or null if absent. */
  description: string | null;
  /** Total number of jobs in this workflow. */
  totalJobs: number;
  /** Total number of steps across all jobs. */
  totalSteps: number;
  /** True if any job or step references a Docker image. */
  hasDockerImages: boolean;
  /** True if any SecretRef was discovered anywhere in the workflow. */
  hasSecrets: boolean;
  /**
   * True if any step uses an external (third-party) action reference.
   * Relevant only for GITHUB_ACTIONS and GITLAB_CI sources.
   */
  hasExternalActions: boolean;
  /**
   * Human-readable label for the originating CI system.
   * @example "GitHub Actions", "GitLab CI"
   */
  ciSystem: string;
}

// =============================================================================
// CORE TYPES — Step, Job, NormalizedWorkflow
// =============================================================================

/**
 * A single atomic unit of work within a Job.
 *
 * - GitHub Actions: one entry under `steps:`
 * - GitLab CI: one entry in `script:` / `before_script:`
 * - Jenkinsfile: one `sh`, `bat`, or plugin invocation
 */
export interface Step {
  /**
   * A stable unique identifier for this step within its parent job.
   * Synthesized by the parser if not natively present in the source.
   */
  id: string;
  /** The display name of the step, or null if the source file did not provide one. */
  name: string | null;
  /** The execution model of this step. */
  type: StepType;
  /**
   * The raw shell command string for RUN and SCRIPT steps.
   * Null for ACTION and PLUGIN steps.
   */
  run: string | null;
  /**
   * The raw `uses:` field value for ACTION steps (e.g. `actions/checkout@v3`).
   * Null for non-ACTION steps.
   */
  uses: string | null;
  /**
   * Parsed decomposition of the `uses:` field.
   * Non-null only when `uses` is non-null and parsing succeeded.
   */
  actionRef: ActionRef | null;
  /**
   * Input parameters passed to an action via the `with:` block.
   * Keys are parameter names; values are their string representations.
   */
  with: Record<string, string>;
  /** Environment variables scoped to this step only. */
  env: EnvVar[];
  /**
   * Conditional expressions that gate whether this step executes.
   * An empty array means the step runs unconditionally.
   */
  conditions: Condition[];
  /**
   * If true, the job continues even if this step exits with a non-zero code.
   * Maps to `continue-on-error:` (GitHub Actions) / `allow_failure:` (GitLab CI).
   */
  continueOnError: boolean;
  /**
   * Maximum time in minutes this step may run before it is killed.
   * Null if no step-level timeout is configured.
   */
  timeoutMinutes: number | null;
}

/**
 * A Job is a single unit of execution within a workflow — a collection of
 * Steps that run sequentially on the same runner environment.
 *
 * - GitHub Actions: one entry under `jobs:`
 * - GitLab CI: one job definition (not a `stage:`)
 * - Jenkins declarative pipeline: one `stage {}` block
 */
export interface Job {
  /**
   * A stable unique identifier for this job within its parent workflow.
   * In GitHub Actions this is the job key (e.g. `build`, `test`).
   */
  id: string;
  /** The display name of the job. May differ from `id` in GitHub Actions. */
  name: string;
  /** Ordered list of steps that make up this job's execution sequence. */
  steps: Step[];
  /**
   * Other jobs that must complete successfully before this job begins.
   * Encodes the workflow DAG (directed acyclic graph).
   */
  needs: Dependency[];
  /** Environment variables scoped to this job. */
  env: EnvVar[];
  /** Secrets referenced by this job. */
  secrets: SecretRef[];
  /**
   * Docker service containers started alongside this job and torn down when
   * the job completes (e.g. a postgres or redis sidecar).
   */
  services: ServiceContainer[];
  /**
   * Specification of the runner/executor where this job runs.
   * Derived from `runs-on:` (GitHub Actions) or `tags:` + `image:` (GitLab CI).
   */
  runsOn: RunnerSpec;
  /**
   * Conditional expressions that gate whether this job is included in the
   * execution plan at all.
   */
  conditions: Condition[];
  /**
   * Matrix build strategy for fanning out this job into multiple parallel runs.
   * Null if this is a single (non-matrix) job.
   */
  strategy: MatrixStrategy | null;
  /**
   * Maximum time in minutes the entire job is allowed to run before it is killed.
   * Null if no job-level timeout is configured.
   */
  timeoutMinutes: number | null;
  /**
   * If true, the workflow continues even if this job fails.
   * Maps to `continue-on-error:` in GitHub Actions.
   */
  continueOnError: boolean;
  /**
   * Retry policy for this job on failure.
   * Null if no retry strategy is configured.
   */
  retryStrategy: RetryStrategy | null;
  /**
   * Artifacts produced or consumed by this job, including cache operations.
   */
  artifacts: ArtifactSpec[];
  /**
   * The Docker container used as the execution environment for the entire job.
   * Maps to `container:` (GitHub Actions) / `image:` (GitLab CI).
   * Null if the job runs directly on the runner host.
   */
  container: ContainerSpec | null;
}

/**
 * The top-level normalized representation of any CI/CD pipeline configuration.
 *
 * Every parser in this platform (GitHub Actions, GitLab CI, Dockerfile,
 * Kubernetes, Helm, Terraform) produces exactly one `NormalizedWorkflow`.
 *
 * The rule engine, analytics layer, and all downstream consumers work exclusively
 * with this type — decoupled from any parser-specific types.
 */
export interface NormalizedWorkflow {
  /**
   * A globally unique identifier for this workflow instance.
   * Typically a UUIDv4 generated at parse time.
   */
  id: string;
  /** The CI/CD system or IaC format this workflow was parsed from. */
  source: WorkflowSource;
  /**
   * The original file path within the repository that was parsed.
   * @example ".github/workflows/ci.yml", ".gitlab-ci.yml"
   */
  sourceFile: string;
  /**
   * Opaque identifier for the repository this workflow belongs to.
   * Used to correlate workflows from the same codebase.
   */
  repoId: string;
  /** The timestamp when this workflow was parsed by the platform. */
  parsedAt: Date;
  /** All jobs defined in this workflow. */
  jobs: Job[];
  /**
   * Events that can trigger this workflow to run.
   * Empty array may indicate a manually-only workflow or unparseable triggers.
   */
  triggers: Trigger[];
  /**
   * Environment variables declared at the workflow/pipeline level,
   * available to all jobs unless overridden at job or step level.
   */
  globalEnv: EnvVar[];
  /**
   * Secrets declared at the workflow/pipeline level.
   * In GitHub Actions, from the `secrets:` block in reusable workflows.
   */
  globalSecrets: SecretRef[];
  /**
   * Workflow-level GITHUB_TOKEN permission declarations.
   * Maps to the top-level `permissions:` block in GitHub Actions.
   * Empty array for CI systems without a native permission model.
   */
  permissions: Permission[];
  /** Aggregated metadata computed by the parser for fast querying and display. */
  metadata: WorkflowMetadata;
}

// =============================================================================
// PARSER RESULT TYPES
// =============================================================================

/**
 * A structured diagnostic message emitted by a parser to describe a problem
 * encountered during parsing. Carries enough context to pinpoint the issue
 * in the source file.
 */
export interface ParserError {
  /** Human-readable description of the parse error or warning. */
  message: string;
  /**
   * The 1-based line number in the source file where the issue was detected.
   * Undefined if the issue cannot be attributed to a specific line.
   */
  line: number | undefined;
  /**
   * The field name (YAML key, JSON property, etc.) where the issue occurred.
   * Undefined if the issue is structural rather than field-specific.
   */
  field: string | undefined;
  /** Severity of this diagnostic. */
  severity: DiagnosticSeverity;
}

/**
 * The generic result wrapper returned by every parser.
 *
 * Parsers always return `ParseResult<NormalizedWorkflow>`. Even on partial failure,
 * parsers MUST populate `result` with whatever they could extract, allowing
 * downstream consumers to work with partial data while still surfacing diagnostics.
 *
 * @template T The type of the successfully parsed value. Typically `NormalizedWorkflow`.
 */
export interface ParseResult<T> {
  /**
   * True if parsing completed without any ERROR-severity diagnostics.
   * A result can be `success: true` while still containing warnings.
   */
  success: boolean;
  /**
   * The parsed value. Parsers populate this with whatever data they could extract,
   * even on partial failure. Null only if the source was completely unparseable.
   */
  result: T | null;
  /** All ERROR-severity diagnostics emitted during parsing. Empty on success. */
  errors: ParserError[];
  /** All WARNING and INFO diagnostics emitted during parsing. May be non-empty even on success. */
  warnings: ParserError[];
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Returns `true` when a Docker image reference is floating — i.e., not
 * content-addressed and therefore potentially mutable between pipeline runs.
 *
 * An image is considered floating when:
 *  - `isFloating` is true (tag is "latest", empty, or absent), OR
 *  - `isPinned` is false (no digest is present)
 *
 * Use this in the rule engine to flag images that can silently change between
 * executions, causing irreproducible builds.
 *
 * @param ref - The DockerImageRef to evaluate.
 * @returns `true` if the image reference is floating or not digest-pinned.
 *
 * @example
 * const ref = parseDockerImage("node:latest");
 * if (isFloatingDockerImage(ref)) {
 *   // Emit a RULE_FLOATING_BASE_IMAGE finding
 * }
 */
export function isFloatingDockerImage(ref: DockerImageRef): boolean {
  return ref.isFloating || !ref.isPinned;
}

/**
 * Returns `true` when an action reference is not pinned to an immutable
 * commit SHA.
 *
 * An action is considered unpinned when:
 *  - `isPinned` is false, OR
 *  - `refType` is not `ActionRefType.SHA`
 *
 * Unpinned actions are a supply chain risk — the action's content can change
 * between runs without the consuming workflow's knowledge.
 *
 * @param ref - The ActionRef to evaluate.
 * @returns `true` if the action is not pinned to a commit SHA.
 *
 * @example
 * const ref = parseActionRef("actions/checkout@v3");
 * if (isUnpinnedAction(ref)) {
 *   // Emit a RULE_UNPINNED_ACTION finding
 * }
 */
export function isUnpinnedAction(ref: ActionRef): boolean {
  return !ref.isPinned || ref.refType !== ActionRefType.SHA;
}
