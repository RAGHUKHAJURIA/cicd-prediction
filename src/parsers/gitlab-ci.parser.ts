/**
 * @file gitlab-ci.parser.ts
 * @description Production-ready parser for GitLab CI YAML files.
 * Converts raw .gitlab-ci.yml into a NormalizedWorkflow. Never throws.
 */
import * as yaml from "js-yaml";
import { randomUUID } from "crypto";
import {
  NormalizedWorkflow, WorkflowSource, Job, Step, StepType,
  Trigger, TriggerType, EnvVar, SecretRef, SecretSource,
  DockerImageRef, RunnerSpec, RunnerType, ContainerSpec,
  ServiceContainer, Condition, ConditionType, MatrixStrategy,
  RetryStrategy, ArtifactSpec, ArtifactType, Dependency,
  WorkflowMetadata, ParseResult, ParserError, DiagnosticSeverity,
} from "../models/workflow.model";
import { parseDockerImageRef, parseEnvVar, scanForSecrets } from "./github-actions.parser";

// ── Constants ─────────────────────────────────────────────────────────────────

const RESERVED_KEYS = new Set([
  "default","stages","workflow","include","variables","image","services",
  "before_script","after_script","cache","artifacts","retry","timeout",
  "interruptible","resource_group","tags","pages",
]);
const DEFAULT_STAGES = ["build", "test", "deploy"];

// ── Local utilities (mirrors github-actions parser internals) ─────────────────

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asRec(v: unknown): Record<string, unknown> | null { return isRec(v) ? v : null; }
function asStr(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}
function asNum(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return null;
}
function asBool(v: unknown, def = false): boolean { return typeof v === "boolean" ? v : def; }
function asStrArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => (typeof x === "string" || typeof x === "number" ? [String(x)] : []));
  if (typeof v === "string") return [v];
  return [];
}

// ── Diagnostic helpers ────────────────────────────────────────────────────────

function mkE(msg: string, field?: string, line?: number): ParserError {
  return { message: msg, field, line, severity: DiagnosticSeverity.ERROR };
}
function mkW(msg: string, field?: string): ParserError {
  return { message: msg, field, line: undefined, severity: DiagnosticSeverity.WARNING };
}

// ── Timeout parser ────────────────────────────────────────────────────────────

/** Parses a GitLab CI timeout string into minutes. */
export function parseGitlabTimeout(timeout: string): number | null {
  const s = timeout.trim().toLowerCase();
  let mins = 0;
  let matched = false;
  const d = s.match(/(\d+)\s*(?:days?|d\b)/);   if (d)  { mins += parseInt(d[1]!) * 1440; matched = true; }
  const h = s.match(/(\d+)\s*(?:hours?|h\b)/);   if (h)  { mins += parseInt(h[1]!) * 60;   matched = true; }
  const m = s.match(/(\d+)\s*(?:minutes?|mins?|m\b)/); if (m) { mins += parseInt(m[1]!);         matched = true; }
  const sc = s.match(/(\d+)\s*(?:seconds?|secs?|s\b)/); if (sc){ mins += Math.round(parseInt(sc[1]!) / 60); matched = true; }
  return matched ? mins : null;
}

// ── Variable parsing ──────────────────────────────────────────────────────────

function parseGitlabVars(vars: unknown): EnvVar[] {
  const rec = asRec(vars) ?? {};
  return Object.entries(rec).map(([key, val]) => {
    if (isRec(val)) return parseEnvVar(key, asStr(val["value"]));
    return parseEnvVar(key, val);
  });
}

// ── Image parsing ─────────────────────────────────────────────────────────────

function parseGitlabImage(img: unknown): { imageStr: string; imageRef: DockerImageRef } | null {
  const str = typeof img === "string" ? img : isRec(img) ? asStr((img as Record<string,unknown>)["name"]) : null;
  if (!str) return null;
  return { imageStr: str, imageRef: parseDockerImageRef(str) };
}

function imageToContainerSpec(img: unknown): ContainerSpec | null {
  const parsed = parseGitlabImage(img);
  if (!parsed) return null;
  return { image: parsed.imageStr, imageRef: parsed.imageRef, env: [], ports: [], volumes: [] };
}

// ── Services ──────────────────────────────────────────────────────────────────

function parseServices(raw: unknown, warnings: ParserError[], fieldBase: string): ServiceContainer[] {
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.flatMap((svc, i): ServiceContainer[] => {
    const field = `${fieldBase}[${i}]`;
    if (typeof svc === "string") {
      const imageRef = parseDockerImageRef(svc);
      if (imageRef.isFloating) warnings.push(mkW(`Service image "${svc}" uses floating tag.`, field));
      const name = imageRef.image.split("/").pop() ?? imageRef.image;
      return [{ name, container: { image: svc, imageRef, env: [], ports: [], volumes: [] } }];
    }
    const rec = asRec(svc);
    if (!rec) return [];
    const imageStr = asStr(rec["name"]) ?? "";
    const alias = asStr(rec["alias"]) ?? "";
    const imageRef = parseDockerImageRef(imageStr);
    if (imageRef.isFloating) warnings.push(mkW(`Service image "${imageStr}" uses floating tag.`, field));
    const name = alias || imageRef.image.split("/").pop() || imageStr;
    return [{ name, container: { image: imageStr, imageRef, env: [], ports: [], volumes: [] } }];
  });
}

// ── Cache & Artifacts ─────────────────────────────────────────────────────────

function parseCacheEntries(raw: unknown, warnings: ParserError[], field: string): ArtifactSpec[] {
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return items.flatMap((item): ArtifactSpec[] => {
    const rec = asRec(item);
    if (!rec) return [];
    const key = asStr(rec["key"]) ?? (isRec(rec["key"]) ? "$CI_COMMIT_REF_SLUG" : null);
    if (!key) warnings.push(mkW("Cache has no key — risk of cache key collision.", field));
    const paths = asStrArr(rec["paths"]);
    const expireIn: string | null = null;
    return [{ name: key ?? "default", paths, expireIn, type: ArtifactType.CACHE }];
  });
}

function parseArtifactSpec(raw: unknown, warnings: ParserError[], field: string): ArtifactSpec[] {
  const rec = asRec(raw);
  if (!rec) return [];
  const paths = asStrArr(rec["paths"]);
  const expireIn = asStr(rec["expire_in"]);
  if (paths.length > 0 && !expireIn)
    warnings.push(mkW("Artifacts have no expire_in — risk of unbounded storage usage.", field));
  const results: ArtifactSpec[] = [];
  if (paths.length > 0) results.push({ name: asStr(rec["name"]) ?? "artifacts", paths, expireIn, type: ArtifactType.UPLOAD });
  return results;
}

// ── Retry ─────────────────────────────────────────────────────────────────────

function parseRetry(raw: unknown, warnings: ParserError[], field: string): RetryStrategy | null {
  if (raw === null || raw === undefined) return null;
  const n = asNum(raw);
  if (n !== null) {
    if (n > 2) warnings.push(mkW(`retry.max ${n} exceeds GitLab's hard limit of 2.`, field));
    return { maxAttempts: Math.min(n, 2), onFailure: true };
  }
  const rec = asRec(raw);
  if (!rec) return null;
  const max = asNum(rec["max"]) ?? 1;
  if (max > 2) warnings.push(mkW(`retry.max ${max} exceeds GitLab's hard limit of 2.`, field));
  const whenArr = asStrArr(rec["when"]);
  return { maxAttempts: Math.min(max, 2), onFailure: whenArr.length > 0 || asBool(rec["when"]) };
}

// ── Parallel/matrix ───────────────────────────────────────────────────────────

function parseParallelStrategy(raw: unknown, warnings: ParserError[], field: string): MatrixStrategy | null {
  if (raw === null || raw === undefined) return null;
  const n = asNum(raw);
  if (n !== null) return { matrix: { index: Array.from({ length: n }, (_, i) => String(i + 1)) }, failFast: false, maxParallel: n };
  const rec = asRec(raw);
  if (!rec) return null;
  const matrixArr = Array.isArray(rec["matrix"]) ? rec["matrix"] : [];
  if (matrixArr.length > 1) warnings.push(mkW("parallel.matrix with multiple dimension sets adds pipeline complexity.", field));
  const matrix: Record<string, string[]> = {};
  for (const item of matrixArr) {
    const itemRec = asRec(item) ?? {};
    for (const [k, v] of Object.entries(itemRec)) {
      const existing = matrix[k] ?? [];
      matrix[k] = [...existing, ...asStrArr(v)];
    }
  }
  return { matrix, failFast: false, maxParallel: null };
}

// ── Conditions ────────────────────────────────────────────────────────────────

function parseConditions(rec: Record<string, unknown>, jobId: string, warnings: ParserError[]): Condition[] {
  const conditions: Condition[] = [];
  const hasRules = !!rec["rules"];
  const hasOnly = !!rec["only"];
  const hasExcept = !!rec["except"];

  if (hasRules && (hasOnly || hasExcept))
    warnings.push(mkW(`Job "${jobId}" uses both rules and only/except. Rules take precedence.`, `jobs.${jobId}`));

  // rules
  const rulesArr = Array.isArray(rec["rules"]) ? rec["rules"] : [];
  for (const rule of rulesArr) {
    const r = asRec(rule) ?? {};
    const ifExpr = asStr(r["if"]) ?? asStr(r["when"]) ?? "";
    if (ifExpr) conditions.push({ expression: ifExpr, type: ConditionType.RULES });
  }

  // only (legacy)
  const onlyVal = rec["only"];
  if (onlyVal) {
    const expr = Array.isArray(onlyVal) ? onlyVal.join(",") : isRec(onlyVal) ? JSON.stringify(onlyVal) : String(onlyVal);
    conditions.push({ expression: expr, type: ConditionType.ONLY });
  }

  // except (legacy)
  const exceptVal = rec["except"];
  if (exceptVal) {
    const expr = Array.isArray(exceptVal) ? exceptVal.join(",") : isRec(exceptVal) ? JSON.stringify(exceptVal) : String(exceptVal);
    conditions.push({ expression: expr, type: ConditionType.EXCEPT });
  }

  // when
  const when = asStr(rec["when"]);
  if (when && when !== "on_success") conditions.push({ expression: when, type: ConditionType.WHEN });

  return conditions;
}

// ── Step builder ──────────────────────────────────────────────────────────────

function buildSteps(
  beforeScript: string[],
  script: string[],
  afterScript: string[],
  jobId: string,
  warnings: ParserError[],
  jobSecrets: SecretRef[],
): Step[] {
  const steps: Step[] = [];
  let idx = 0;

  function makeRunStep(cmd: string, prefix: string): Step {
    const id = `${jobId}-step-${idx++}`;
    const name = prefix ? `${prefix}: ${cmd.slice(0, 60)}` : cmd.slice(0, 60);

    // Security scanning
    const found = scanForSecrets(cmd, true);
    for (const s of found) {
      if (!jobSecrets.some((js) => js.name === s.name && js.source === s.source)) jobSecrets.push(s);
    }
    if (/\bnpm\s+install\b/.test(cmd) && !/\bnpm\s+ci\b/.test(cmd))
      warnings.push(mkW(`"npm install" detected in job "${jobId}". Use "npm ci" for reproducible installs.`, `${jobId}.script`));
    if (/curl\s+.*\|\s*(ba)?sh/.test(cmd) || /wget\s+.*\|\s*(ba)?sh/.test(cmd))
      warnings.push(mkW(`Piped curl/wget into shell in job "${jobId}" — remote code execution risk.`, `${jobId}.script`));
    if (cmd.includes("$CI_REGISTRY_PASSWORD"))
      warnings.push(mkW(`$CI_REGISTRY_PASSWORD is exposed in script of job "${jobId}".`, `${jobId}.script`));

    return { id, name, type: StepType.RUN, run: cmd, uses: null, actionRef: null, with: {}, env: [], conditions: [], continueOnError: false, timeoutMinutes: null };
  }

  for (const cmd of beforeScript) steps.push(makeRunStep(cmd, "Before script"));
  for (const cmd of script)       steps.push(makeRunStep(cmd, ""));
  for (const cmd of afterScript)  steps.push(makeRunStep(cmd, "After script"));
  return steps;
}

// ── Job parser ────────────────────────────────────────────────────────────────

interface JobParseCtx {
  defaultImage: ContainerSpec | null;
  defaultBeforeScript: string[];
  defaultAfterScript: string[];
  defaultRetry: RetryStrategy | null;
  defaultTags: string[];
}

function parseJobEntry(
  jobId: string,
  raw: unknown,
  ctx: JobParseCtx,
  warnings: ParserError[],
): { job: Job; stage: string; hasExplicitNeeds: boolean } {
  const rec = asRec(raw) ?? {};
  const field = `jobs.${jobId}`;

  // stage
  const stage = asStr(rec["stage"]) ?? "test";
  if (!rec["stage"]) warnings.push(mkW(`Job "${jobId}" has no stage — defaulting to "test".`, `${field}.stage`));

  // script
  const scriptRaw = rec["script"];
  if (!scriptRaw && scriptRaw !== "") warnings.push(mkW(`Job "${jobId}" has no script field.`, `${field}.script`));
  const script = asStrArr(scriptRaw);
  const beforeScript = rec["before_script"] ? asStrArr(rec["before_script"]) : [...ctx.defaultBeforeScript];
  const afterScript = rec["after_script"] ? asStrArr(rec["after_script"]) : [...ctx.defaultAfterScript];

  // image / container
  const jobImageRaw = rec["image"];
  const container = jobImageRaw ? imageToContainerSpec(jobImageRaw) : ctx.defaultImage;
  if (container?.imageRef.isFloating)
    warnings.push(mkW(`Job "${jobId}" image "${container.image}" uses floating tag.`, `${field}.image`));

  // services
  const services = parseServices(rec["services"], warnings, `${field}.services`);

  // env / variables
  const env = parseGitlabVars(rec["variables"]);

  // needs
  const hasExplicitNeeds = rec["needs"] !== undefined;
  let needs: Dependency[] = [];
  if (hasExplicitNeeds) {
    const needsArr = Array.isArray(rec["needs"]) ? rec["needs"] : [];
    for (const n of needsArr) {
      if (typeof n === "string") needs.push({ jobId: n, outputs: [] });
      else if (isRec(n) && n["job"]) needs.push({ jobId: String(n["job"]), outputs: [] });
    }
  }

  // secrets (accumulated)
  const secrets: SecretRef[] = [];

  // steps
  const steps = buildSteps(beforeScript, script, afterScript, jobId, warnings, secrets);

  // conditions
  const conditions = parseConditions(rec, jobId, warnings);

  // runner spec
  const tags = asStrArr(rec["tags"]).length > 0 ? asStrArr(rec["tags"]) : ctx.defaultTags;
  let runsOn: RunnerSpec;
  if (tags.length > 0) {
    runsOn = { type: RunnerType.SELF_HOSTED, labels: tags, image: null };
  } else if (container) {
    runsOn = { type: RunnerType.DOCKER, labels: [], image: container.image };
  } else {
    runsOn = { type: RunnerType.UNKNOWN, labels: [], image: null };
  }

  // timeout
  let timeoutMinutes: number | null = null;
  const timeoutStr = asStr(rec["timeout"]);
  if (timeoutStr) {
    timeoutMinutes = parseGitlabTimeout(timeoutStr);
    if (timeoutMinutes === null)
      warnings.push(mkW(`Job "${jobId}" timeout "${timeoutStr}" could not be parsed.`, `${field}.timeout`));
  }

  // retry
  const retry = parseRetry(rec["retry"], warnings, `${field}.retry`) ?? ctx.defaultRetry;

  // continue-on-error / allow_failure
  const af = rec["allow_failure"];
  const continueOnError = typeof af === "boolean" ? af : isRec(af) ? true : false;

  // strategy (parallel)
  const strategy = parseParallelStrategy(rec["parallel"], warnings, `${field}.parallel`);

  // artifacts & cache
  const artifacts: ArtifactSpec[] = [
    ...parseArtifactSpec(rec["artifacts"], warnings, `${field}.artifacts`),
    ...parseCacheEntries(rec["cache"], warnings, `${field}.cache`),
  ];

  // dependencies → add to needs if no explicit needs
  if (!hasExplicitNeeds && Array.isArray(rec["dependencies"])) {
    needs = asStrArr(rec["dependencies"]).map((jid) => ({ jobId: jid, outputs: [] }));
  }

  const job: Job = {
    id: jobId, name: asStr(rec["name"]) ?? jobId, steps, needs,
    env, secrets, services,
    runsOn, conditions, strategy,
    timeoutMinutes, continueOnError,
    retryStrategy: retry, artifacts, container: container ?? null,
  };

  return { job, stage, hasExplicitNeeds };
}

// ── Stage-based dependency resolution ────────────────────────────────────────

function resolveStageBasedDeps(
  jobs: Job[],
  stages: string[],
  jobStageMap: Map<string, string>,
  hasExplicitNeeds: Set<string>,
): void {
  const stageJobMap = new Map<string, string[]>();
  for (const [jobId, stage] of jobStageMap)
    stageJobMap.set(stage, [...(stageJobMap.get(stage) ?? []), jobId]);

  for (let i = 1; i < stages.length; i++) {
    const prevJobs = stageJobMap.get(stages[i - 1]!) ?? [];
    for (const jobId of stageJobMap.get(stages[i]!) ?? []) {
      if (!hasExplicitNeeds.has(jobId)) {
        const job = jobs.find((j) => j.id === jobId);
        if (job) job.needs = prevJobs.map((pid) => ({ jobId: pid, outputs: [] }));
      }
    }
  }
}

// ── Trigger parser ────────────────────────────────────────────────────────────

function parseWorkflowTriggers(workflowField: unknown): Trigger[] {
  const rec = asRec(workflowField);
  if (!rec) return [{ type: TriggerType.PUSH, branches: [], paths: [], schedule: null }];
  const rulesArr = Array.isArray(rec["rules"]) ? rec["rules"] : [];
  if (rulesArr.length === 0) return [{ type: TriggerType.PUSH, branches: [], paths: [], schedule: null }];
  return rulesArr.map((rule): Trigger => {
    const r = asRec(rule) ?? {};
    const ifExpr = asStr(r["if"]) ?? "";
    const type = ifExpr.includes("CI_MERGE_REQUEST") ? TriggerType.MERGE_REQUEST
      : ifExpr.includes("CI_PIPELINE_SOURCE") ? TriggerType.PIPELINE
      : TriggerType.PUSH;
    return { type, branches: [], paths: [], schedule: null };
  });
}

// ── Metadata ──────────────────────────────────────────────────────────────────

function buildMetadata(jobs: Job[], name: string | null, hasGlobalImage: boolean): WorkflowMetadata {
  const totalSteps = jobs.reduce((s, j) => s + j.steps.length, 0);
  const hasDockerImages = hasGlobalImage || jobs.some(
    (j) => j.container !== null || j.services.length > 0
  );
  const hasSecrets = jobs.some((j) => j.secrets.length > 0 || j.env.some((e) => e.containsSecret));
  const hasExternalActions = false; // GitLab CI uses scripts, not external action refs
  return { name, description: null, totalJobs: jobs.length, totalSteps, hasDockerImages, hasSecrets, hasExternalActions, ciSystem: "gitlab-ci" };
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────

/**
 * Parses a raw GitLab CI YAML file into a NormalizedWorkflow.
 */
export function parseGitlabCI(
  rawYaml: string,
  filePath: string,
  repoId: string,
): ParseResult<NormalizedWorkflow> {
  const errors: ParserError[] = [];
  const warnings: ParserError[] = [];

  // ── 1. Parse YAML ──────────────────────────────────────────────────────────
  let doc: unknown;
  try {
    doc = yaml.load(rawYaml);
  } catch (e) {
    const ye = e as yaml.YAMLException;
    errors.push(mkE(`YAML parse error: ${ye.message}`, undefined, ye.mark?.line !== undefined ? ye.mark.line + 1 : undefined));
    return { success: false, result: null, errors, warnings };
  }

  const root = asRec(doc);
  if (!root) {
    errors.push(mkE("Pipeline file is empty or not a valid YAML mapping."));
    return { success: false, result: null, errors, warnings };
  }

  // ── 2. Top-level fields ────────────────────────────────────────────────────
  const stages: string[] = Array.isArray(root["stages"]) ? asStrArr(root["stages"]) : [...DEFAULT_STAGES];

  const globalEnv = parseGitlabVars(root["variables"]);

  // Warn if no workflow rules (pipeline runs on every push)
  if (!root["workflow"]) warnings.push(mkW("No workflow rules defined — pipeline runs on every push and MR event."));
  const triggers = parseWorkflowTriggers(root["workflow"]);

  // include warning
  if (root["include"]) warnings.push(mkW("Pipeline uses include — external configuration reduces local visibility."));

  // global image
  const globalImageParsed = parseGitlabImage(root["image"]);
  const globalContainer = globalImageParsed ? imageToContainerSpec(root["image"]) : null;
  if (globalContainer?.imageRef.isFloating)
    warnings.push(mkW(`Global image "${globalContainer.image}" uses floating tag.`, "image"));

  // default block
  const defaultRec = asRec(root["default"]) ?? {};
  const defaultContainer = defaultRec["image"] ? imageToContainerSpec(defaultRec["image"]) : null;
  const ctx: JobParseCtx = {
    defaultImage: defaultContainer ?? globalContainer,
    defaultBeforeScript: asStrArr(defaultRec["before_script"] ?? root["before_script"]),
    defaultAfterScript: asStrArr(defaultRec["after_script"] ?? root["after_script"]),
    defaultRetry: parseRetry(defaultRec["retry"], warnings, "default.retry"),
    defaultTags: asStrArr(defaultRec["tags"] ?? root["tags"]),
  };

  // global secrets scan
  const globalSecrets = globalEnv
    .filter((e) => e.containsSecret && e.value)
    .map((e) => ({ name: e.key, source: SecretSource.ENV, value: null as string | null, isExposed: false }));

  // ── 3. Parse jobs ──────────────────────────────────────────────────────────
  const jobs: Job[] = [];
  const jobStageMap = new Map<string, string>();
  const hasExplicitNeedsSet = new Set<string>();
  const allJobIds = new Set(Object.keys(root).filter((k) => !RESERVED_KEYS.has(k)));

  for (const [jobId, rawJob] of Object.entries(root)) {
    if (RESERVED_KEYS.has(jobId)) continue;
    try {
      const { job, stage, hasExplicitNeeds } = parseJobEntry(jobId, rawJob, ctx, warnings);
      jobs.push(job);
      jobStageMap.set(jobId, stage);
      if (hasExplicitNeeds) hasExplicitNeedsSet.add(jobId);
    } catch (e) {
      errors.push(mkE(`Failed to parse job "${jobId}": ${e instanceof Error ? e.message : String(e)}`, `jobs.${jobId}`));
    }
  }

  // ── 4. Validate needs references ──────────────────────────────────────────
  for (const job of jobs) {
    for (const dep of job.needs) {
      if (!allJobIds.has(dep.jobId))
        warnings.push(mkW(`Job "${job.id}" needs "${dep.jobId}" which does not exist in this pipeline.`, `jobs.${job.id}.needs`));
    }
  }

  // ── 5. Stage-based dependency resolution ──────────────────────────────────
  resolveStageBasedDeps(jobs, stages, jobStageMap, hasExplicitNeedsSet);

  // ── 6. Assemble result ─────────────────────────────────────────────────────
  const metadata = buildMetadata(jobs, null, globalImageParsed !== null);
  const workflow: NormalizedWorkflow = {
    id: randomUUID(), source: WorkflowSource.GITLAB_CI,
    sourceFile: filePath, repoId, parsedAt: new Date(),
    jobs, triggers, globalEnv, globalSecrets,
    permissions: [], metadata,
  };

  return { success: errors.length === 0, result: workflow, errors, warnings };
}
