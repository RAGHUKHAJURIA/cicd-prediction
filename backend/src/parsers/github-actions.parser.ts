/**
 * @file github-actions.parser.ts
 * @description Production-ready parser for GitHub Actions workflow YAML files.
 * Converts raw YAML into a NormalizedWorkflow. Never throws — all errors
 * are captured and returned in the ParseResult envelope.
 */

import * as yaml from "js-yaml";
import { randomUUID } from "crypto";
import {
  NormalizedWorkflow,
  WorkflowSource,
  Job,
  Step,
  StepType,
  Trigger,
  TriggerType,
  EnvVar,
  SecretRef,
  SecretSource,
  ActionRef,
  ActionRefType,
  DockerImageRef,
  RunnerSpec,
  RunnerType,
  ContainerSpec,
  ServiceContainer,
  Condition,
  ConditionType,
  Permission,
  PermissionAccess,
  MatrixStrategy,
  RetryStrategy,
  ArtifactSpec,
  Dependency,
  WorkflowMetadata,
  ParseResult,
  ParserError,
  DiagnosticSeverity,
} from "../models/workflow.model";

// =============================================================================
// UTILITY — safe YAML value accessors
// =============================================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asRecord(v: unknown): Record<string, unknown> | null {
  return isRecord(v) ? v : null;
}
function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}
function asNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)))
    return Number(v);
  return null;
}
function asBoolean(v: unknown, def = false): boolean {
  return typeof v === "boolean" ? v : def;
}
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v))
    return v.flatMap((x) => (typeof x === "string" || typeof x === "number" ? [String(x)] : []));
  if (typeof v === "string") return [v];
  return [];
}

// =============================================================================
// DIAGNOSTIC HELPERS
// =============================================================================

function mkError(message: string, field?: string, line?: number): ParserError {
  return { message, field, line, severity: DiagnosticSeverity.ERROR };
}
function mkWarn(message: string, field?: string, line?: number): ParserError {
  return { message, field, line, severity: DiagnosticSeverity.WARNING };
}

// =============================================================================
// HELPER — parseActionRef
// =============================================================================

/** Parses a GitHub Actions `uses:` field into a structured ActionRef. */
export function parseActionRef(uses: string): ActionRef {
  // Local action (./path)
  if (uses.startsWith("./") || uses.startsWith("../")) {
    return {
      owner: "",
      repo: uses,
      ref: "",
      refType: ActionRefType.FLOATING,
      isThirdParty: false,
      isPinned: false,
    };
  }

  // Docker action (docker://image:tag)
  if (uses.startsWith("docker://")) {
    return {
      owner: "docker",
      repo: uses.slice(9),
      ref: "",
      refType: ActionRefType.FLOATING,
      isThirdParty: true,
      isPinned: false,
    };
  }

  const atIdx = uses.lastIndexOf("@");
  if (atIdx === -1) {
    const parts = uses.split("/");
    const owner = parts[0] ?? "";
    return {
      owner,
      repo: parts.slice(1).join("/"),
      ref: "",
      refType: ActionRefType.FLOATING,
      isThirdParty: !["actions", "github"].includes(owner.toLowerCase()),
      isPinned: false,
    };
  }

  const actionPath = uses.slice(0, atIdx);
  const ref = uses.slice(atIdx + 1);
  const slashIdx = actionPath.indexOf("/");
  const owner = slashIdx === -1 ? actionPath : actionPath.slice(0, slashIdx);
  const repo = slashIdx === -1 ? "" : actionPath.slice(slashIdx + 1);

  let refType: ActionRefType;
  let isPinned = false;

  if (/^[0-9a-f]{40}$/i.test(ref)) {
    refType = ActionRefType.SHA;
    isPinned = true;
  } else if (/^v?\d+(\.\d+)*(-[a-z0-9.]+)?$/i.test(ref)) {
    refType = ActionRefType.TAG;
  } else if (
    ["main", "master", "develop", "development", "HEAD"].includes(ref) ||
    /^[a-z0-9_][a-z0-9/_.-]*$/i.test(ref)
  ) {
    refType = ActionRefType.BRANCH;
  } else {
    refType = ActionRefType.FLOATING;
  }

  return {
    owner,
    repo,
    ref,
    refType,
    isThirdParty: !["actions", "github"].includes(owner.toLowerCase()),
    isPinned,
  };
}

// =============================================================================
// HELPER — parseDockerImageRef
// =============================================================================

/** Parses a Docker image string into a structured DockerImageRef. */
export function parseDockerImageRef(imageString: string): DockerImageRef {
  let str = imageString.trim();
  let digest: string | null = null;
  let tag: string | null = null;
  let registry: string | null = null;

  // Extract digest (@sha256:...)
  const atIdx = str.indexOf("@");
  if (atIdx !== -1) {
    digest = str.slice(atIdx + 1);
    str = str.slice(0, atIdx);
  }

  // Detect registry prefix: first path component that contains a dot or colon, or is "localhost"
  const firstSlash = str.indexOf("/");
  if (firstSlash !== -1) {
    const first = str.slice(0, firstSlash);
    if (first.includes(".") || first.includes(":") || first === "localhost") {
      registry = first;
      str = str.slice(firstSlash + 1);
    }
  }

  // Extract tag (last colon in remaining string)
  const lastColon = str.lastIndexOf(":");
  if (lastColon !== -1) {
    tag = str.slice(lastColon + 1);
    str = str.slice(0, lastColon);
  }

  const image = str;
  const isFloating = !tag || tag === "latest";
  const isPinned = digest !== null;

  return { registry, image, tag, digest, isFloating, isPinned };
}

// =============================================================================
// HELPER — parseEnvVar
// =============================================================================

const SECRET_KEY_RE =
  /(_TOKEN|_SECRET|_PASSWORD|_PASSWD|_CREDENTIAL|_PWD|_KEY|PRIVATE_KEY)$|^(API_|AUTH_|AWS_SECRET|GH_TOKEN)/i;

/** Parses a single env-var key/value pair into an EnvVar. */
export function parseEnvVar(key: string, value: unknown): EnvVar {
  const strVal = value === null || value === undefined ? null : String(value);
  const isDynamic =
    strVal !== null && (strVal.includes("${{") || strVal.includes("${"));
  const containsSecret = SECRET_KEY_RE.test(key);
  return { key, value: strVal, isDynamic, containsSecret };
}

// =============================================================================
// HELPER — scanForSecrets
// =============================================================================

const SECRETS_CTX_RE = /\$\{\{\s*secrets\.([A-Z0-9_a-z]+)\s*\}\}/g;
const HARDCODED_PATTERNS: RegExp[] = [
  /ghp_[A-Za-z0-9]{36}/,
  /ghs_[A-Za-z0-9]{36}/,
  /github_pat_[A-Za-z0-9_]{82}/,
  /AKIA[0-9A-Z]{16}/,
  /eyJ[A-Za-z0-9\-_]{20,}/,
];

/** Scans any string content for secret patterns and returns discovered SecretRefs. */
export function scanForSecrets(content: string, isExposed = false): SecretRef[] {
  const refs: SecretRef[] = [];
  const seen = new Set<string>();

  SECRETS_CTX_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SECRETS_CTX_RE.exec(content)) !== null) {
    const name = m[1] ?? "UNKNOWN";
    const key = `ctx:${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ name, source: SecretSource.SECRETS_CONTEXT, value: null, isExposed });
    }
  }

  for (const pattern of HARDCODED_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const val = match[0];
      const key = `hc:${val}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ name: "HARDCODED_SECRET", source: SecretSource.HARDCODED, value: val, isExposed: true });
      }
    }
  }

  return refs;
}

// =============================================================================
// HELPER — parseTriggers
// =============================================================================

const TRIGGER_MAP: Record<string, TriggerType> = {
  push: TriggerType.PUSH,
  pull_request: TriggerType.PULL_REQUEST,
  pull_request_target: TriggerType.PULL_REQUEST,
  schedule: TriggerType.SCHEDULE,
  workflow_dispatch: TriggerType.MANUAL,
  workflow_call: TriggerType.API,
  repository_dispatch: TriggerType.API,
  release: TriggerType.TAG,
  create: TriggerType.TAG,
  merge_group: TriggerType.PULL_REQUEST,
};

function parseTriggers(onField: unknown): Trigger[] {
  const triggers: Trigger[] = [];

  function makeSimpleTrigger(eventName: string, obj?: Record<string, unknown>): void {
    const type = TRIGGER_MAP[eventName];
    if (!type) return;

    if (eventName === "schedule") {
      const items = Array.isArray(obj) ? obj : [];
      for (const item of items) {
        const rec = asRecord(item);
        const cron = rec ? asString(rec["cron"]) : null;
        triggers.push({ type: TriggerType.SCHEDULE, branches: [], paths: [], schedule: cron });
      }
      return;
    }

    const branches = obj ? asStringArray(obj["branches"] ?? obj["branches-ignore"]) : [];
    const paths = obj ? asStringArray(obj["paths"] ?? obj["paths-ignore"]) : [];
    triggers.push({ type, branches, paths, schedule: null });
  }

  // Shape 1: single string — on: push
  if (typeof onField === "string") {
    makeSimpleTrigger(onField);
    return triggers;
  }

  // Shape 2: array — on: [push, pull_request]
  if (Array.isArray(onField)) {
    for (const item of onField) {
      if (typeof item === "string") makeSimpleTrigger(item);
    }
    return triggers;
  }

  // Shape 3 & 4: object — on: { push: { branches: [...] }, schedule: [...] }
  const rec = asRecord(onField);
  if (!rec) return triggers;

  for (const [eventName, eventConfig] of Object.entries(rec)) {
    if (eventName === "schedule") {
      const items = Array.isArray(eventConfig) ? eventConfig : [];
      for (const item of items) {
        const r = asRecord(item);
        const cron = r ? asString(r["cron"]) : null;
        triggers.push({ type: TriggerType.SCHEDULE, branches: [], paths: [], schedule: cron });
      }
    } else {
      const cfg = asRecord(eventConfig) ?? {};
      makeSimpleTrigger(eventName, cfg);
    }
  }

  return triggers;
}

// =============================================================================
// HELPER — parsePermissions
// =============================================================================

function parsePermissions(permsField: unknown): Permission[] {
  if (typeof permsField === "string") {
    const access =
      permsField === "write-all" ? PermissionAccess.WRITE : PermissionAccess.READ;
    return [{ scope: "all", access }];
  }
  const rec = asRecord(permsField);
  if (!rec) return [];
  return Object.entries(rec).map(([scope, val]) => {
    const str = (asString(val) ?? "").toLowerCase();
    const access =
      str === "write"
        ? PermissionAccess.WRITE
        : str === "none"
        ? PermissionAccess.NONE
        : PermissionAccess.READ;
    return { scope, access };
  });
}

// =============================================================================
// HELPER — parseRunnerSpec
// =============================================================================

function parseRunnerSpec(runsOn: unknown): RunnerSpec {
  // String
  if (typeof runsOn === "string") {
    const type = runsOn.toLowerCase().includes("self-hosted")
      ? RunnerType.SELF_HOSTED
      : RunnerType.GITHUB_HOSTED;
    return { type, labels: [runsOn], image: null };
  }

  // Array: [self-hosted, linux, x64]
  if (Array.isArray(runsOn)) {
    const labels = runsOn.map(String);
    const type = labels.some((l) => l.toLowerCase() === "self-hosted")
      ? RunnerType.SELF_HOSTED
      : RunnerType.GITHUB_HOSTED;
    return { type, labels, image: null };
  }

  // Object: { group: ..., labels: [...] }
  const rec = asRecord(runsOn);
  if (rec) {
    const labels = asStringArray(rec["labels"]);
    const group = asString(rec["group"]);
    if (group && !labels.includes(group)) labels.unshift(group);
    return { type: RunnerType.SELF_HOSTED, labels, image: null };
  }

  return { type: RunnerType.UNKNOWN, labels: [], image: null };
}

// =============================================================================
// HELPER — parseContainerSpec
// =============================================================================

function parseContainerSpec(
  containerField: unknown,
  warnings: ParserError[],
  fieldPath: string
): ContainerSpec | null {
  if (!containerField) return null;

  let imageStr: string;
  let envMap: Record<string, unknown> = {};
  let ports: number[] = [];
  let volumes: string[] = [];

  if (typeof containerField === "string") {
    imageStr = containerField;
  } else {
    const rec = asRecord(containerField);
    if (!rec) return null;
    imageStr = asString(rec["image"]) ?? "";
    envMap = asRecord(rec["env"]) ?? {};
    ports = Array.isArray(rec["ports"])
      ? rec["ports"].map(Number).filter((n) => !isNaN(n))
      : [];
    volumes = asStringArray(rec["volumes"]);
  }

  if (!imageStr) return null;

  const imageRef = parseDockerImageRef(imageStr);

  if (imageRef.isFloating) {
    warnings.push(
      mkWarn(
        `Docker image "${imageStr}" uses a floating tag (latest or no tag). Pin to a specific digest for reproducibility.`,
        fieldPath + ".image"
      )
    );
  }

  const env = Object.entries(envMap).map(([k, v]) => parseEnvVar(k, v));

  return { image: imageStr, imageRef, env, ports, volumes };
}

// =============================================================================
// HELPER — parseStep
// =============================================================================

function parseStep(
  raw: unknown,
  jobId: string,
  stepIdx: number,
  warnings: ParserError[],
  jobSecrets: SecretRef[]
): Step {
  const rec = asRecord(raw) ?? {};
  const fieldBase = `jobs.${jobId}.steps[${stepIdx}]`;

  const id = asString(rec["id"]) ?? `${jobId}-step-${stepIdx}`;
  const name = asString(rec["name"]);
  const uses = asString(rec["uses"]);
  const run = asString(rec["run"]);
  const timeoutMinutes = asNumber(rec["timeout-minutes"]);
  const continueOnError = asBoolean(rec["continue-on-error"]);
  const ifExpr = asString(rec["if"]);

  // Determine step type
  let type: StepType;
  if (uses) {
    type = uses.startsWith("docker://") ? StepType.DOCKER : StepType.ACTION;
  } else if (run) {
    type = StepType.RUN;
  } else {
    type = StepType.SCRIPT;
    warnings.push(mkWarn(`Step has neither "uses" nor "run".`, fieldBase));
  }

  // Parse action ref
  let actionRef = null;
  if (uses) {
    actionRef = parseActionRef(uses);
    if (!actionRef.isPinned && type === StepType.ACTION) {
      warnings.push(
        mkWarn(
          `Action "${uses}" is not pinned to a commit SHA (refType: ${actionRef.refType}). Pin to a full SHA for supply-chain safety.`,
          `${fieldBase}.uses`
        )
      );
    }
  }

  // Parse with block
  const withBlock: Record<string, string> = {};
  const withRec = asRecord(rec["with"]);
  if (withRec) {
    for (const [k, v] of Object.entries(withRec)) {
      withBlock[k] = String(v ?? "");
    }
  }

  // Parse env vars and scan for secrets
  const envRec = asRecord(rec["env"]) ?? {};
  const env: EnvVar[] = Object.entries(envRec).map(([k, v]) => parseEnvVar(k, v));

  // Scan env values for secrets context references
  for (const [, v] of Object.entries(envRec)) {
    const found = scanForSecrets(String(v ?? ""), true);
    for (const s of found) {
      if (!jobSecrets.some((js) => js.name === s.name && js.source === s.source)) {
        jobSecrets.push(s);
      }
    }
  }

  // Scan run command for secrets and dangerous patterns
  if (run) {
    const runSecrets = scanForSecrets(run, true);
    for (const s of runSecrets) {
      if (!jobSecrets.some((js) => js.name === s.name && js.source === s.source)) {
        jobSecrets.push(s);
      }
    }

    if (/\bnpm\s+install\b/.test(run) && !/\bnpm\s+ci\b/.test(run)) {
      warnings.push(
        mkWarn(
          `"npm install" detected in step. Use "npm ci" for reproducible installs in CI.`,
          `${fieldBase}.run`
        )
      );
    }
    if (/curl\s+.*\|\s*(ba)?sh/.test(run) || /wget\s+.*\|\s*(ba)?sh/.test(run)) {
      warnings.push(
        mkWarn(
          `Piped curl/wget into shell detected — this is a security risk (remote code execution).`,
          `${fieldBase}.run`
        )
      );
    }
    if (runSecrets.some((s) => s.source === SecretSource.HARDCODED)) {
      warnings.push(
        mkWarn(`Potential hardcoded secret detected in run command.`, `${fieldBase}.run`)
      );
    }
  }

  const conditions: Condition[] = ifExpr
    ? [{ expression: ifExpr, type: ConditionType.IF }]
    : [];

  return {
    id,
    name,
    type,
    run,
    uses,
    actionRef,
    with: withBlock,
    env,
    conditions,
    continueOnError,
    timeoutMinutes,
  };
}

// =============================================================================
// HELPER — parseJob
// =============================================================================

function parseJob(
  jobId: string,
  rawJob: unknown,
  warnings: ParserError[]
): Job {
  const rec = asRecord(rawJob) ?? {};
  const fieldBase = `jobs.${jobId}`;

  // needs
  const needsRaw = rec["needs"];
  const needsArr = asStringArray(needsRaw);
  const needs: Dependency[] = needsArr.map((jid) => ({ jobId: jid, outputs: [] }));

  // runs-on
  const runsOn = parseRunnerSpec(rec["runs-on"]);

  // timeout-minutes
  const timeoutMinutes = asNumber(rec["timeout-minutes"]);
  if (timeoutMinutes === null) {
    warnings.push(
      mkWarn(
        `Job "${jobId}" has no timeout-minutes configured. This is a reliability risk.`,
        `${fieldBase}.timeout-minutes`
      )
    );
  }

  // continue-on-error
  const continueOnError = asBoolean(rec["continue-on-error"]);

  // if condition
  const ifExpr = asString(rec["if"]);
  const conditions: Condition[] = ifExpr
    ? [{ expression: ifExpr, type: ConditionType.IF }]
    : [];

  // strategy / matrix
  let strategy: MatrixStrategy | null = null;
  const strategyRec = asRecord(rec["strategy"]);
  if (strategyRec) {
    const matrixRec = asRecord(strategyRec["matrix"]) ?? {};
    const matrix: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(matrixRec)) {
      if (Array.isArray(v)) {
        matrix[k] = v.map(String);
      }
    }
    strategy = {
      matrix,
      failFast: asBoolean(strategyRec["fail-fast"], true),
      maxParallel: asNumber(strategyRec["max-parallel"]),
    };
  }

  // env
  const envRec = asRecord(rec["env"]) ?? {};
  const env: EnvVar[] = Object.entries(envRec).map(([k, v]) => parseEnvVar(k, v));

  // secrets (accumulated during step parsing)
  const secrets: SecretRef[] = [];

  // container
  const container = parseContainerSpec(rec["container"], warnings, `${fieldBase}.container`);

  // services
  const servicesRec = asRecord(rec["services"]) ?? {};
  const services: ServiceContainer[] = [];
  for (const [svcName, svcDef] of Object.entries(servicesRec)) {
    const svcContainer = parseContainerSpec(svcDef, warnings, `${fieldBase}.services.${svcName}`);
    if (svcContainer) {
      services.push({ name: svcName, container: svcContainer });
    }
  }

  // retry strategy (not native to GHA but mapped where possible)
  const retryStrategy: RetryStrategy | null = null;

  // artifacts
  const artifacts: ArtifactSpec[] = [];

  // steps
  const stepsRaw = Array.isArray(rec["steps"]) ? rec["steps"] : [];
  if (stepsRaw.length === 0) {
    warnings.push(mkWarn(`Job "${jobId}" has no steps defined.`, `${fieldBase}.steps`));
  }

  const steps: Step[] = stepsRaw.map((rawStep, idx) =>
    parseStep(rawStep, jobId, idx, warnings, secrets)
  );

  return {
    id: jobId,
    name: asString(rec["name"]) ?? jobId,
    steps,
    needs,
    env,
    secrets,
    services,
    runsOn,
    conditions,
    strategy,
    timeoutMinutes,
    continueOnError,
    retryStrategy,
    artifacts,
    container,
  };
}

// =============================================================================
// HELPER — calculateMetadata
// =============================================================================

function calculateMetadata(
  jobs: Job[],
  name: string | null
): WorkflowMetadata {
  const totalSteps = jobs.reduce((acc, j) => acc + j.steps.length, 0);

  const hasDockerImages = jobs.some(
    (j) =>
      j.container !== null ||
      j.services.length > 0 ||
      j.steps.some(
        (s) => s.type === StepType.DOCKER || (s.uses?.startsWith("docker://") ?? false)
      )
  );

  const hasSecrets =
    jobs.some((j) => j.secrets.length > 0) ||
    jobs.some((j) => j.steps.some((s) => s.env.some((e) => e.containsSecret)));

  const hasExternalActions = jobs.some((j) =>
    j.steps.some((s) => s.actionRef?.isThirdParty === true)
  );

  return {
    name,
    description: null,
    totalJobs: jobs.length,
    totalSteps,
    hasDockerImages,
    hasSecrets,
    hasExternalActions,
    ciSystem: "github-actions",
  };
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Parses a raw GitHub Actions YAML workflow file into a NormalizedWorkflow.
 *
 * @param rawYaml  - Raw YAML content of the workflow file.
 * @param filePath - Path of the file within the repository (e.g. `.github/workflows/ci.yml`).
 * @param repoId   - Opaque repository identifier.
 * @returns ParseResult containing the normalized workflow, errors, and warnings.
 */
export function parseGithubActions(
  rawYaml: string,
  filePath: string,
  repoId: string
): ParseResult<NormalizedWorkflow> {
  const errors: ParserError[] = [];
  const warnings: ParserError[] = [];

  // ── Step 1: Parse YAML ────────────────────────────────────────────────────
  let doc: unknown;
  try {
    doc = yaml.load(rawYaml);
  } catch (e) {
    const yamlErr = e as yaml.YAMLException;
    errors.push(
      mkError(
        `YAML parse error: ${yamlErr.message}`,
        undefined,
        yamlErr.mark?.line !== undefined ? yamlErr.mark.line + 1 : undefined
      )
    );
    return { success: false, result: null, errors, warnings };
  }

  // ── Step 2: Validate top-level structure ──────────────────────────────────
  const root = asRecord(doc);
  if (!root) {
    errors.push(mkError("Workflow file is empty or not a valid YAML mapping."));
    return { success: false, result: null, errors, warnings };
  }

  const jobsRaw = root["jobs"];
  if (!jobsRaw) {
    errors.push(mkError('No "jobs" field found in workflow.', "jobs"));
    return { success: false, result: null, errors, warnings };
  }
  const jobsRec = asRecord(jobsRaw);
  if (!jobsRec) {
    errors.push(mkError('"jobs" field must be a mapping of job ids to job definitions.', "jobs"));
    return { success: false, result: null, errors, warnings };
  }

  // ── Step 3: Parse top-level fields ────────────────────────────────────────
  const name = asString(root["name"]);
  const onField = root["on"];
  const triggers = parseTriggers(onField);
  const permissions = parsePermissions(root["permissions"]);

  const globalEnvRec = asRecord(root["env"]) ?? {};
  const globalEnv: EnvVar[] = Object.entries(globalEnvRec).map(([k, v]) => parseEnvVar(k, v));

  // Scan global env for secrets
  const globalSecrets: SecretRef[] = [];
  for (const [, v] of Object.entries(globalEnvRec)) {
    const found = scanForSecrets(String(v ?? ""), false);
    for (const s of found) {
      if (!globalSecrets.some((gs) => gs.name === s.name && gs.source === s.source)) {
        globalSecrets.push(s);
      }
    }
  }

  // ── Step 4: Parse jobs ────────────────────────────────────────────────────
  const jobs: Job[] = [];
  for (const [jobId, rawJob] of Object.entries(jobsRec)) {
    try {
      jobs.push(parseJob(jobId, rawJob, warnings));
    } catch (e) {
      errors.push(
        mkError(
          `Failed to parse job "${jobId}": ${e instanceof Error ? e.message : String(e)}`,
          `jobs.${jobId}`
        )
      );
    }
  }

  // ── Step 5: Build metadata ────────────────────────────────────────────────
  const metadata = calculateMetadata(jobs, name);

  // ── Step 6: Assemble NormalizedWorkflow ───────────────────────────────────
  const workflow: NormalizedWorkflow = {
    id: randomUUID(),
    source: WorkflowSource.GITHUB_ACTIONS,
    sourceFile: filePath,
    repoId,
    parsedAt: new Date(),
    jobs,
    triggers,
    globalEnv,
    globalSecrets,
    permissions,
    metadata,
  };

  return {
    success: errors.length === 0,
    result: workflow,
    errors,
    warnings,
  };
}
