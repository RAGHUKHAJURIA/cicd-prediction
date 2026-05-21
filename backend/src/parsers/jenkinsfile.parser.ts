/**
 * @file jenkinsfile.parser.ts
 * @description Production-ready parser for Jenkinsfile content (Declarative & Scripted).
 */

import { randomUUID } from "crypto";
import {
  NormalizedWorkflow, WorkflowSource, Job, Step, StepType,
  EnvVar, SecretRef, SecretSource, Condition, ConditionType, TriggerType,
  WorkflowMetadata, ParseResult, ParserError, DiagnosticSeverity, RunnerType, Trigger,
} from "../models/workflow.model";
import { scanForSecrets, parseEnvVar } from "./github-actions.parser";

function mkW(message: string): ParserError {
  return { message, field: undefined, line: 0, severity: DiagnosticSeverity.WARNING };
}

function detectPipelineFormat(content: string): 'declarative' | 'scripted' | 'unknown' {
  if (/pipeline\s*\{/.test(content)) return 'declarative';
  if (/node\s*(\([^\)]*\))?\s*\{/.test(content)) return 'scripted';
  return 'unknown';
}

function extractBlock(content: string, keyword: string | RegExp): string | null {
  let matchIdx = -1;
  let blockStart = -1;
  
  if (typeof keyword === "string") {
    const rx = new RegExp(keyword + "\\s*\\{");
    const m = content.match(rx);
    if (m) matchIdx = m.index! + m[0].length - 1;
  } else {
    const m = content.match(keyword);
    if (m) {
      const braceIdx = content.indexOf("{", m.index!);
      if (braceIdx !== -1) {
        matchIdx = braceIdx;
      }
    }
  }

  if (matchIdx === -1) return null;
  
  blockStart = matchIdx;
  let braceCount = 0;
  for (let i = blockStart; i < content.length; i++) {
    if (content[i] === "{") braceCount++;
    else if (content[i] === "}") {
      braceCount--;
      if (braceCount === 0) {
        return content.substring(blockStart + 1, i).trim();
      }
    }
  }
  return null;
}

function extractAllBlocks(content: string, keyword: string | RegExp): string[] {
  const blocks: string[] = [];
  let remaining = content;
  while (true) {
    const block = extractBlock(remaining, keyword);
    if (!block) break;
    blocks.push(block);
    
    // Find where the block was to slice remaining
    let matchIdx = -1;
    if (typeof keyword === "string") {
      const rx = new RegExp(keyword + "\\s*\\{");
      const m = remaining.match(rx);
      if (m) matchIdx = m.index!;
    } else {
      const m = remaining.match(keyword);
      if (m) matchIdx = m.index!;
    }
    
    if (matchIdx !== -1) {
      // Find end of block
      let blockStart = remaining.indexOf("{", matchIdx);
      let braceCount = 0;
      let endIdx = -1;
      for (let i = blockStart; i < remaining.length; i++) {
        if (remaining[i] === "{") braceCount++;
        else if (remaining[i] === "}") {
          braceCount--;
          if (braceCount === 0) {
            endIdx = i;
            break;
          }
        }
      }
      if (endIdx !== -1) {
        remaining = remaining.substring(endIdx + 1);
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return blocks;
}

function extractStringArg(line: string, keyword: string): string | null {
  const rx = new RegExp(keyword + "\\s*\\(?\\s*(?:'([^']+)'|\"([^\"]+)\")");
  const m = line.match(rx);
  if (m) return m[1] || m[2] || null;
  return null;
}

function parseGroovyMap(content: string): Record<string, string> {
  const res: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = line.trim().match(/^([a-zA-Z0-9_]+)\s*=?\s*(?:'([^']+)'|"([^"]+)"|(credentials\(['"]([^'"]+)['"]\))|([^ ]+))/);
    if (m) {
      const key = m[1]!;
      const val = m[2] || m[3] || m[4] || m[6] || "";
      res[key] = val;
    }
  }
  return res;
}

// Unused extractShCommand removed

function scanStepsInBlock(block: string, jobSteps: Step[], warnings: ParserError[], jobId: string) {
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith("sh ") || line.startsWith("bat ") || line.startsWith("echo ")) {
      const type = line.startsWith("echo") ? StepType.RUN : StepType.RUN;
      let cmd = "";
      if (line.includes('"""')) {
        const m = block.substring(block.indexOf(line)).match(/sh\s*"""([\s\S]*?)"""/);
        if (m) {
          cmd = m[1]!;
        }
      } else {
        const m = line.match(/^(?:sh|bat|echo)\s+['"](.*?)['"]/);
        if (m) cmd = m[1]!;
      }
      if (cmd) {
        jobSteps.push({
          id: `${jobId}-step-${jobSteps.length}`,
          name: `Run ${cmd.slice(0, 15)}...`,
          type,
          run: cmd,
          uses: null,
          actionRef: null,
          with: {},
          env: [],
          conditions: [],
          continueOnError: false,
          timeoutMinutes: null
        });

        const lc = cmd.toLowerCase();
        if (lc.includes("npm install") && !lc.includes("npm ci")) {
          warnings.push(mkW(`npm install instead of npm ci`));
        }
        if (lc.includes("curl ") && (lc.includes(" | bash") || lc.includes(" | sh"))) {
          warnings.push(mkW(`sh with curl | bash or wget | sh patterns`));
        }
        
        const secrets = scanForSecrets(cmd, true);
        if (secrets.some(s => s.source === SecretSource.HARDCODED)) {
          warnings.push(mkW(`hardcoded credentials strings detected in sh commands`));
        }
      }
    } else if (line.startsWith("input ")) {
      warnings.push(mkW(`input step used (manual approval gate — blocks pipeline)`));
    } else if (line.startsWith("sleep(") || line.startsWith("sleep ")) {
      warnings.push(mkW(`sleep() used (brittle timing — use waitUntil instead)`));
    }
  }
}

export function parseJenkinsfile(
  rawContent: string,
  filePath: string,
  repoId: string
): ParseResult<NormalizedWorkflow> {
  const errors: ParserError[] = [];
  const warnings: ParserError[] = [];
  const jobs: Job[] = [];
  const globalEnv: EnvVar[] = [];
  const globalSecrets: SecretRef[] = [];
  const triggers: Trigger[] = [];
  let hasTimeout = false;
  let isDeclarative = true;

  const format = detectPipelineFormat(rawContent);
  if (format === 'unknown') {
    if (rawContent.trim() !== "") {
      warnings.push(mkW(`Unknown Jenkinsfile format`));
    }
    return {
      success: format !== 'unknown' ? true : rawContent.trim() === "",
      result: rawContent.trim() === "" ? null : {
        id: randomUUID(),
        source: WorkflowSource.JENKINS,
        sourceFile: filePath,
        repoId,
        parsedAt: new Date(),
        jobs: [],
        triggers: [],
        globalEnv: [],
        globalSecrets: [],
        permissions: [],
        metadata: {
          name: null, description: null, totalJobs: 0, totalSteps: 0,
          hasDockerImages: false, hasSecrets: false, hasExternalActions: false, ciSystem: "jenkins"
        }
      },
      errors,
      warnings
    };
  }

  isDeclarative = format === 'declarative';

  if (!isDeclarative) {
    warnings.push(mkW(`Scripted pipeline used (recommend declarative for readability)`));
    
    // Parse Scripted Pipeline
    const nodeMatches = rawContent.match(/node\s*(\(['"]([^'"]+)['"]\))?\s*\{/g);
    let runsOn = { type: RunnerType.UNKNOWN, labels: [] as string[], image: null as string | null };
    if (nodeMatches && nodeMatches[0]) {
      const labelMatch = nodeMatches[0].match(/node\s*\(['"]([^'"]+)['"]\)/);
      if (labelMatch) {
        runsOn = { type: RunnerType.SELF_HOSTED, labels: labelMatch[1]!.split("&&").map(s => s.trim()), image: null };
      }
    }

    const stages = extractAllBlocks(rawContent, /stage\s*\(['"][^'"]+['"]\)/);
    for (let i = 0; i < stages.length; i++) {
      const stageContent = stages[i]!;
      const match = rawContent.substring(rawContent.indexOf(stageContent) - 30).match(/stage\s*\(['"]([^'"]+)['"]\)/);
      const name = match ? match[1]! : `stage-${i}`;
      const jobId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      
      const steps: Step[] = [];
      scanStepsInBlock(stageContent, steps, warnings, jobId);

      const job: Job = {
        id: jobId,
        name,
        steps,
        needs: i > 0 ? [{ jobId: jobs[i - 1]!.id, outputs: [] }] : [],
        env: [],
        secrets: [],
        services: [],
        runsOn,
        conditions: [],
        strategy: null,
        timeoutMinutes: null,
        continueOnError: false,
        retryStrategy: null,
        artifacts: [],
        container: null
      };
      jobs.push(job);
    }
  } else {
    // Declarative
    const pipelineBlock = extractBlock(rawContent, "pipeline");
    if (!pipelineBlock) {
      errors.push({ message: "Could not extract pipeline block", field: undefined, line: 0, severity: DiagnosticSeverity.ERROR });
      return { success: false, result: null, errors, warnings };
    }

    // Agent
    const agentBlock = extractBlock(pipelineBlock, "agent");
    let globalRunsOn = { type: RunnerType.UNKNOWN, labels: [] as string[], image: null as string | null };
    if (agentBlock !== null || pipelineBlock.includes("agent any")) {
      if (pipelineBlock.includes("agent any")) {
        globalRunsOn.labels = ["any"];
        warnings.push(mkW(`agent any used in production pipeline (no runner control)`));
      } else if (agentBlock) {
        if (agentBlock.includes("label")) {
          const l = extractStringArg(agentBlock, "label");
          if (l) globalRunsOn = { type: RunnerType.SELF_HOSTED, labels: l.split("&&").map(s => s.trim()), image: null };
        } else if (agentBlock.includes("docker")) {
          const dockerBlock = extractBlock(agentBlock, "docker");
          if (dockerBlock) {
            const img = extractStringArg(dockerBlock, "image");
            if (img) {
              globalRunsOn = { type: RunnerType.DOCKER, labels: [], image: img };
              if (img.includes("latest") || !img.includes(":")) warnings.push(mkW(`Using latest tag in docker agent image`));
            }
          }
        }
      }
    } else {
      warnings.push(mkW(`No agent defined (pipeline may fail to run)`));
    }

    // Environment
    const envBlock = extractBlock(pipelineBlock, "environment");
    if (envBlock) {
      const vars = parseGroovyMap(envBlock);
      for (const [k, v] of Object.entries(vars)) {
        if (v.startsWith("credentials(")) {
          globalSecrets.push({ name: k, source: SecretSource.VAULT, isExposed: false, value: null });
        } else {
          globalEnv.push(parseEnvVar(k, v));
        }
      }
    }

    // Triggers
    const triggersBlock = extractBlock(pipelineBlock, "triggers");
    if (triggersBlock) {
      const lines = triggersBlock.split(/\r?\n/);
      for (const line of lines) {
        if (line.includes("cron(")) {
          triggers.push({ type: TriggerType.SCHEDULE, schedule: extractStringArg(line, "cron") || null, branches: [], paths: [] });
        } else if (line.includes("pollSCM(")) {
          triggers.push({ type: TriggerType.SCHEDULE, schedule: extractStringArg(line, "pollSCM") || null, branches: [], paths: [] });
        } else if (line.includes("githubPush()")) {
          triggers.push({ type: TriggerType.PUSH, schedule: null, branches: [], paths: [] });
        }
      }
    }

    // Options
    const optionsBlock = extractBlock(pipelineBlock, "options");
    if (optionsBlock) {
      const tMatch = optionsBlock.match(/timeout\s*\(\s*time\s*:\s*(\d+)\s*,\s*unit\s*:\s*['"]([A-Z]+)['"]/);
      if (tMatch) {
        hasTimeout = true;
        let t = parseInt(tMatch[1]!, 10);
        const u = tMatch[2]!;
        if (u === "HOURS") t *= 60;
        // timeoutMinutes = t; // we could use it if needed
      }
    }
    if (!hasTimeout) warnings.push(mkW(`No timeout defined on pipeline or long-running stages`));

    // Parameters
    const paramsBlock = extractBlock(pipelineBlock, "parameters");
    if (paramsBlock && paramsBlock.includes("password(")) {
      warnings.push(mkW(`password parameter type used (secrets in build params)`));
    }

    // Post block (global)
    const postBlock = extractBlock(pipelineBlock, "post");
    if (!postBlock) warnings.push(mkW(`No post block defined (no cleanup or failure handling)`));
    const globalPostSteps: Step[] = [];
    if (postBlock) {
      for (const cond of ["always", "success", "failure"]) {
        const condBlock = extractBlock(postBlock, cond);
        if (condBlock) {
          scanStepsInBlock(condBlock, globalPostSteps, warnings, "global-post");
        }
      }
    }

    // Stages
    const stagesBlock = extractBlock(pipelineBlock, "stages");
    if (stagesBlock) {
      const stageMatches = stagesBlock.match(/stage\s*\(['"][^'"]+['"]\)/g) || [];
      let lastSequentialJobId: string | null = null;

      for (const sm of stageMatches) {
        const nameMatch = sm.match(/stage\s*\(['"]([^'"]+)['"]\)/);
        const name = nameMatch ? nameMatch[1]! : "unknown";
        const jobId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        
        // Find the stage block content
        // Need exact index to prevent matching inner stages if nested
        const rx = new RegExp(sm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s*\\{");
        const matchInfo = stagesBlock.match(rx);
        if (!matchInfo) continue;

        let blockStart = stagesBlock.indexOf("{", matchInfo.index);
        let braceCount = 0;
        let endIdx = -1;
        for (let i = blockStart; i < stagesBlock.length; i++) {
          if (stagesBlock[i] === "{") braceCount++;
          else if (stagesBlock[i] === "}") {
            braceCount--;
            if (braceCount === 0) {
              endIdx = i;
              break;
            }
          }
        }
        
        const stageContent = endIdx !== -1 ? stagesBlock.substring(blockStart + 1, endIdx).trim() : "";

        // Check for parallel
        const parallelBlock = extractBlock(stageContent, "parallel");
        if (parallelBlock) {
          // Inner stages
          const innerMatches = parallelBlock.match(/stage\s*\(['"][^'"]+['"]\)/g) || [];
          for (const im of innerMatches) {
            const iNameMatch = im.match(/stage\s*\(['"]([^'"]+)['"]\)/);
            const iName = iNameMatch ? iNameMatch[1]! : "unknown";
            const iJobId = iName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            const innerStageContent = extractBlock(parallelBlock.substring(parallelBlock.indexOf(im)), im) || "";
            
            const steps: Step[] = [];
            const innerStepsBlock = extractBlock(innerStageContent, "steps");
            if (innerStepsBlock) scanStepsInBlock(innerStepsBlock, steps, warnings, iJobId);
            
            jobs.push({
              id: iJobId,
              name: iName,
              steps,
              needs: lastSequentialJobId ? [{ jobId: lastSequentialJobId, outputs: [] }] : [],
              env: [], secrets: [], services: [], conditions: [],
              runsOn: globalRunsOn, strategy: null, timeoutMinutes: null,
              continueOnError: false, retryStrategy: null, artifacts: [], container: null
            });
          }
          // Note: parallel stages don't update lastSequentialJobId to each other.
          // The next sequential stage depends on ALL parallel jobs, but to keep simple, we can just let it depend on the last sequential before parallel, OR the parallel wrapper.
          // Let's create a wrapper job or just let the next job depend on all parallel jobs.
          const innerIds = innerMatches.map(im => im.match(/stage\s*\(['"]([^'"]+)['"]\)/)![1]!.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
          lastSequentialJobId = innerIds.length > 0 ? innerIds[innerIds.length - 1]! : lastSequentialJobId;
          continue;
        }

        const stepsBlock = extractBlock(stageContent, "steps");
        const steps: Step[] = [];
        if (stepsBlock) {
          scanStepsInBlock(stepsBlock, steps, warnings, jobId);
        }

        // conditions
        const conditions: Condition[] = [];
        const whenBlock = extractBlock(stageContent, "when");
        if (whenBlock) {
          conditions.push({ type: ConditionType.IF, expression: whenBlock });
        }

        const jobSecrets: SecretRef[] = [];
        const withCredsMatch = stepsBlock?.match(/withCredentials\(\[([\s\S]+?)\]\)/);
        if (withCredsMatch) {
          const vars = withCredsMatch[1]!.match(/variable:\s*['"]([^'"]+)['"]/g);
          if (vars) {
            for (const v of vars) {
              const vn = v.match(/['"]([^'"]+)['"]/)?.[1];
              if (vn) jobSecrets.push({ name: vn, source: SecretSource.VAULT, isExposed: false, value: null });
            }
          }
        }

        jobs.push({
          id: jobId,
          name,
          steps,
          needs: lastSequentialJobId ? [{ jobId: lastSequentialJobId, outputs: [] }] : [],
          env: [],
          secrets: jobSecrets,
          services: [],
          runsOn: globalRunsOn,
          conditions,
          strategy: null,
          timeoutMinutes: null,
          continueOnError: false,
          retryStrategy: null,
          artifacts: [],
          container: null
        });

        lastSequentialJobId = jobId;
      }
    }

    if (jobs.length > 15) {
      warnings.push(mkW(`Large number of stages (more than 15 — complexity warning)`));
    }
    
    // Add global post steps to the last job
    if (jobs.length > 0 && globalPostSteps.length > 0) {
      jobs[jobs.length - 1]!.steps.push(...globalPostSteps);
    }
  }

  const hasSecrets = globalEnv.some(e => e.containsSecret) || jobs.some(j => j.env.some(e => e.containsSecret) || j.secrets.length > 0) || globalSecrets.length > 0;
  const totalSteps = jobs.reduce((acc, j) => acc + j.steps.length, 0);

  const workflow: NormalizedWorkflow = {
    id: randomUUID(),
    source: WorkflowSource.JENKINS,
    sourceFile: filePath,
    repoId,
    parsedAt: new Date(),
    jobs,
    triggers,
    globalEnv,
    globalSecrets,
    permissions: [],
    metadata: {
      name: null,
      description: null,
      totalJobs: jobs.length,
      totalSteps,
      hasDockerImages: jobs.some(j => j.runsOn.type === RunnerType.DOCKER),
      hasSecrets,
      hasExternalActions: false,
      ciSystem: "jenkins"
    } as WorkflowMetadata & Record<string, unknown>
  };

  return {
    success: errors.length === 0,
    result: workflow,
    errors,
    warnings
  };
}
