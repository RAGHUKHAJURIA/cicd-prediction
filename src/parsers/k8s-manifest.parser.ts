/**
 * @file k8s-manifest.parser.ts
 * @description Production-ready parser for Kubernetes manifests.
 */

import * as jsyaml from "js-yaml";
import { randomUUID } from "crypto";
import {
  NormalizedWorkflow, WorkflowSource, Job, StepType,
  EnvVar, SecretRef, SecretSource,
  WorkflowMetadata, ParseResult, ParserError, DiagnosticSeverity, RunnerType, Trigger, TriggerType, Permission, PermissionAccess, ContainerSpec
} from "../models/workflow.model";
import { parseDockerImageRef } from "./github-actions.parser";

function mkE(message: string): ParserError {
  return { message, field: undefined, line: undefined, severity: DiagnosticSeverity.ERROR };
}
function mkW(message: string): ParserError {
  return { message, field: undefined, line: undefined, severity: DiagnosticSeverity.WARNING };
}

function parseContainer(c: any, warnings: ParserError[], jobSecrets: SecretRef[]): ContainerSpec {
  const imageStr = c.image || "";
  const imageRef = parseDockerImageRef(imageStr);
  
  if (imageRef.isFloating) {
    warnings.push(mkW(`Container image "${imageStr}" uses latest tag or has no tag`));
  } else if (!imageRef.isPinned) {
    warnings.push(mkW(`Container image "${imageStr}" not pinned to digest`));
  }

  if (c.imagePullPolicy === "Always" && !imageRef.isPinned) {
    warnings.push(mkW(`imagePullPolicy: Always without digest pin (unnecessary pulls)`));
  }
  if (!c.imagePullPolicy && !imageRef.isPinned) {
    warnings.push(mkW(`imagePullPolicy missing when using mutable tags`));
  }

  // Security Context
  const sc = c.securityContext || {};
  if (sc.runAsUser === 0 || sc.runAsNonRoot !== true) {
    warnings.push(mkW(`Container runs as root (runAsUser: 0 or no runAsNonRoot)`));
  }
  if (sc.allowPrivilegeEscalation !== false) {
    warnings.push(mkW(`allowPrivilegeEscalation not set to false`));
  }
  if (sc.readOnlyRootFilesystem !== true) {
    warnings.push(mkW(`readOnlyRootFilesystem not set to true`));
  }
  if (sc.privileged === true) {
    warnings.push(mkW(`Privileged container (securityContext.privileged: true)`));
  }
  if (sc.capabilities?.add) {
    const caps = sc.capabilities.add as string[];
    if (caps.includes("NET_ADMIN") || caps.includes("SYS_ADMIN")) {
      warnings.push(mkW(`Dangerous capabilities added (${caps.join(', ')})`));
    }
  }
  if (!c.securityContext) {
    warnings.push(mkW(`No securityContext defined on container`));
  }

  // Resources
  const res = c.resources || {};
  if (!res.requests) {
    warnings.push(mkW(`No resource requests defined (scheduler cannot make decisions)`));
  }
  if (!res.limits) {
    warnings.push(mkW(`No resource limits defined (container can consume unlimited)`));
  } else if (res.limits.memory && res.limits.memory.endsWith("Gi")) {
    const mem = parseInt(res.limits.memory, 10);
    if (mem > 4) warnings.push(mkW(`memory limit is very high (>4Gi) without justification`));
  }

  // Probes
  if (!c.livenessProbe) warnings.push(mkW(`No livenessProbe defined (orchestrator cannot detect deadlock)`));
  if (!c.readinessProbe) warnings.push(mkW(`No readinessProbe defined (traffic sent to unready pods)`));

  const env: EnvVar[] = [];
  if (Array.isArray(c.env)) {
    for (const e of c.env) {
      if (e.value !== undefined) {
        env.push({ key: e.name, value: String(e.value), isDynamic: false, containsSecret: false });
      } else if (e.valueFrom) {
        if (e.valueFrom.secretKeyRef) {
          const sr: SecretRef = {
            name: e.name,
            source: SecretSource.VAULT,
            isExposed: false,
            value: null
          };
          jobSecrets.push(sr);
        } else {
          env.push({ key: e.name, value: null, isDynamic: true, containsSecret: false });
        }
      }
    }
  }

  const ports: number[] = [];
  if (Array.isArray(c.ports)) {
    for (const p of c.ports) {
      if (p.containerPort) ports.push(Number(p.containerPort));
    }
  }

  const volumes: string[] = [];
  if (Array.isArray(c.volumeMounts)) {
    for (const v of c.volumeMounts) {
      volumes.push(`${v.name}:${v.mountPath}`);
    }
  }

  return {
    image: imageStr,
    imageRef,
    env,
    ports,
    volumes
  };
}

export function parseK8sManifest(
  rawContent: string,
  filePath: string,
  repoId: string
): ParseResult<NormalizedWorkflow> {
  const errors: ParserError[] = [];
  const warnings: ParserError[] = [];
  const jobs: Job[] = [];
  const triggers: Trigger[] = [];
  const permissions: Permission[] = [];
  let totalResources = 0;

  let docs: any[] = [];
  try {
    docs = jsyaml.loadAll(rawContent).filter(Boolean);
  } catch (err: any) {
    errors.push(mkE(`Invalid YAML: ${err.message}`));
    return { success: false, result: null, errors, warnings };
  }

  for (const doc of docs) {
    if (typeof doc !== "object" || !doc.kind) continue;
    totalResources++;

    const kind = doc.kind as string;
    const meta = doc.metadata || {};
    const name = meta.name || "unnamed";
    
    if (!meta.namespace) {
      warnings.push(mkW(`No namespace defined (defaults to default namespace) for ${kind}/${name}`));
    }
    
    if (!meta.labels || (!meta.labels.app && !meta.labels.version && !meta.labels['part-of'])) {
      warnings.push(mkW(`Missing recommended labels (app, version, component, part-of) on ${kind}/${name}`));
    }

    const mkJob = (jobName: string): Job => ({
      id: name, name: jobName, steps: [], needs: [], env: [], secrets: [], services: [],
      runsOn: { type: RunnerType.UNKNOWN, labels: ["kubernetes"], image: null },
      conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false,
      retryStrategy: null, artifacts: [], container: null
    });

    if (["Deployment", "StatefulSet", "DaemonSet"].includes(kind)) {
      const spec = doc.spec || {};
      if (kind === "Deployment" && spec.replicas === 1) {
        warnings.push(mkW(`Deployment with replicas: 1 (single point of failure)`));
      }
      
      if (spec.strategy?.rollingUpdate?.maxUnavailable === "100%") {
        warnings.push(mkW(`RollingUpdate with maxUnavailable: 100% (causes downtime)`));
      }

      const templateSpec = spec.template?.spec || {};
      if (templateSpec.terminationGracePeriodSeconds < 30) {
        warnings.push(mkW(`terminationGracePeriodSeconds too low (less than 30)`));
      }

      const job = mkJob(`${kind}: ${name}`);
      const containers = templateSpec.containers || [];
      if (containers.length > 0) {
        job.container = parseContainer(containers[0], warnings, job.secrets);
        if (containers[0].command) {
          job.steps.push({
            id: `${job.id}-step-0`, name: "RUN command", type: StepType.RUN, run: JSON.stringify(containers[0].command),
            uses: null, actionRef: null, with: {}, env: [], conditions: [], continueOnError: false, timeoutMinutes: null
          });
        }
      }
      jobs.push(job);

    } else if (kind === "Job") {
      const spec = doc.spec || {};
      const job = mkJob(`Job: ${name}`);
      
      if (spec.backoffLimit !== undefined) {
        job.retryStrategy = { maxAttempts: Number(spec.backoffLimit), onFailure: true };
      }
      if (spec.activeDeadlineSeconds !== undefined) {
        job.timeoutMinutes = Math.ceil(Number(spec.activeDeadlineSeconds) / 60);
      }
      
      const templateSpec = spec.template?.spec || {};
      const containers = templateSpec.containers || [];
      if (containers.length > 0) {
        job.container = parseContainer(containers[0], warnings, job.secrets);
      }
      jobs.push(job);

    } else if (kind === "CronJob") {
      const spec = doc.spec || {};
      if (spec.schedule) {
        triggers.push({ type: TriggerType.SCHEDULE, schedule: spec.schedule, branches: [], paths: [] });
      }
      const jobTemplateSpec = spec.jobTemplate?.spec || {};
      const job = mkJob(`CronJob: ${name}`);
      if (jobTemplateSpec.backoffLimit !== undefined) job.retryStrategy = { maxAttempts: Number(jobTemplateSpec.backoffLimit), onFailure: true };
      if (jobTemplateSpec.activeDeadlineSeconds !== undefined) job.timeoutMinutes = Math.ceil(Number(jobTemplateSpec.activeDeadlineSeconds) / 60);
      
      const podSpec = jobTemplateSpec.template?.spec || {};
      const containers = podSpec.containers || [];
      if (containers.length > 0) job.container = parseContainer(containers[0], warnings, job.secrets);
      jobs.push(job);

    } else if (kind === "Service") {
      const type = doc.spec?.type;
      if (type === "LoadBalancer" && !doc.spec?.loadBalancerSourceRanges) {
        warnings.push(mkW(`LoadBalancer Service without source range restrictions (open to internet)`));
      }
    } else if (kind === "ConfigMap") {
      const data = doc.data || {};
      for (const k of Object.keys(data)) {
        if (/secret|password|token|key|cred/i.test(k)) {
          warnings.push(mkW(`ConfigMap with secret-looking data warning: ${k}`));
        }
      }
    } else if (kind === "Secret") {
      warnings.push(mkW(`Secret resource committed to version control`));
      if (doc.stringData) {
        warnings.push(mkW(`plaintext secret warning: stringData used in Secret`));
      }
    } else if (kind === "Ingress") {
      const spec = doc.spec || {};
      if (!spec.tls) {
        warnings.push(mkW(`Ingress without TLS configuration`));
      }
    } else if (kind === "ServiceAccount") {
      if (doc.automountServiceAccountToken !== false) {
        warnings.push(mkW(`ServiceAccount with automountServiceAccountToken: true`));
      }
    } else if (kind === "Role" || kind === "ClusterRole") {
      const rules = doc.rules || [];
      for (const rule of rules) {
        if (rule.verbs?.includes("*") || rule.resources?.includes("*")) {
          warnings.push(mkW(`Wildcard permissions in RBAC roles (verbs or resources contains '*')`));
        }
        permissions.push({ scope: name, access: PermissionAccess.WRITE });
      }
    } else if (kind === "RoleBinding" || kind === "ClusterRoleBinding") {
      if (doc.roleRef?.name === "cluster-admin") {
        warnings.push(mkW(`ClusterRoleBinding to cluster-admin`));
      }
    }
  }

  const hasSecrets = jobs.some(j => j.secrets.length > 0);
  const totalSteps = jobs.reduce((acc, j) => acc + j.steps.length, 0);

  const workflow: NormalizedWorkflow = {
    id: randomUUID(),
    source: WorkflowSource.KUBERNETES,
    sourceFile: filePath,
    repoId,
    parsedAt: new Date(),
    jobs,
    triggers,
    globalEnv: [],
    globalSecrets: [],
    permissions,
    metadata: {
      name: null,
      description: null,
      totalJobs: jobs.length,
      totalSteps,
      hasDockerImages: jobs.length > 0,
      hasSecrets,
      hasExternalActions: false,
      ciSystem: "kubernetes",
      totalResources
    } as WorkflowMetadata & Record<string, unknown>
  };

  return {
    success: errors.length === 0,
    result: workflow,
    errors,
    warnings
  };
}
