/**
 * @file dockerfile.parser.ts
 * @description Production-ready parser for Dockerfile content.
 * Converts line-by-line instructions into a NormalizedWorkflow.
 */

import { randomUUID } from "crypto";
import {
  NormalizedWorkflow, WorkflowSource, Job, Step, StepType,
  EnvVar, SecretRef, SecretSource,
  WorkflowMetadata, ParseResult, ParserError, DiagnosticSeverity, RunnerType,
} from "../models/workflow.model";
import { parseDockerImageRef, parseEnvVar, scanForSecrets } from "./github-actions.parser";

function mkW(message: string, line?: number): ParserError {
  return { message, field: undefined, line, severity: DiagnosticSeverity.WARNING };
}

interface ParsedLine {
  instruction: string;
  args: string;
  lineNum: number;
}

function parseDockerfileLines(rawContent: string): ParsedLine[] {
  const lines = rawContent.split(/\r?\n/);
  const parsed: ParsedLine[] = [];
  let currentInstruction = "";
  let currentArgs = "";
  let startLineNum = 0;
  let inContinuation = false;
  let inHeredoc = false;
  let heredocDelimiter = "";

  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i]!;
    const trimmed = originalLine.trim();

    if (inHeredoc) {
      currentArgs += "\n" + originalLine;
      if (trimmed === heredocDelimiter) {
        parsed.push({ instruction: currentInstruction, args: currentArgs.trim(), lineNum: startLineNum });
        inHeredoc = false;
        inContinuation = false;
        currentInstruction = "";
        currentArgs = "";
      }
      continue;
    }

    if (!inContinuation && (trimmed === "" || trimmed.startsWith("#"))) {
      // Directives like # syntax=... are skipped for workflow mapping
      continue;
    }

    let lineToProcess = originalLine;
    const endsWithSlash = !trimmed.startsWith("#") && trimmed.endsWith("\\");
    if (endsWithSlash) {
      lineToProcess = lineToProcess.replace(/\\\s*$/, "");
    }

    if (!inContinuation) {
      startLineNum = i + 1;
      const match = trimmed.match(/^([A-Z]+)\s*(.*)$/i);
      if (match) {
        currentInstruction = match[1]!.toUpperCase();
        currentArgs = match[2]!;
      } else {
        currentInstruction = "UNKNOWN";
        currentArgs = trimmed;
      }
    } else {
      currentArgs += " " + lineToProcess.trim();
    }

    // Check for heredoc
    const heredocMatch = currentArgs.match(/<<-?\s*([A-Za-z0-9_]+)$/);
    if (heredocMatch && !endsWithSlash) {
      inHeredoc = true;
      heredocDelimiter = heredocMatch[1]!;
      continue;
    }

    if (endsWithSlash) {
      inContinuation = true;
    } else {
      parsed.push({ instruction: currentInstruction, args: currentArgs.trim(), lineNum: startLineNum });
      inContinuation = false;
      currentInstruction = "";
      currentArgs = "";
    }
  }

  // Flush remaining
  if (currentInstruction && !inHeredoc) {
    parsed.push({ instruction: currentInstruction, args: currentArgs.trim(), lineNum: startLineNum });
  }

  return parsed;
}

export function parseDockerfile(
  rawContent: string,
  filePath: string,
  repoId: string
): ParseResult<NormalizedWorkflow> {
  const errors: ParserError[] = [];
  const warnings: ParserError[] = [];
  const jobs: Job[] = [];
  const globalEnv: EnvVar[] = [];
  const globalSecrets: SecretRef[] = [];

  let currentJob: Job | null = null;
  let currentUser = "root";
  let hasHealthcheck = false;
  let isMultiStage = false;
  let totalStages = 0;
  let exposedPorts: number[] = [];
  let runCount = 0;
  let stepIndex = 0;

  const parsedLines = parseDockerfileLines(rawContent);

  for (const pl of parsedLines) {
    const { instruction, args, lineNum } = pl;

    if (instruction === "FROM") {
      totalStages++;
      if (jobs.length > 0) isMultiStage = true;

      const parts = args.split(/\s+/);
      let imageStr = parts[0]!;
      let alias = "";

      // Handle --platform
      if (imageStr.startsWith("--platform=")) {
        imageStr = parts[1] ?? "";
        const asIdx = parts.findIndex(p => p.toUpperCase() === "AS");
        if (asIdx !== -1 && parts[asIdx + 1]) alias = parts[asIdx + 1]!;
      } else {
        const asIdx = parts.findIndex(p => p.toUpperCase() === "AS");
        if (asIdx !== -1 && parts[asIdx + 1]) alias = parts[asIdx + 1]!;
      }

      const imageRef = parseDockerImageRef(imageStr);
      if (imageRef.isPinned) imageRef.isFloating = false;

      if (imageRef.isFloating) {
        warnings.push(mkW(`Base image "${imageStr}" uses latest tag or has no tag.`, lineNum));
      } else if (!imageRef.isPinned) {
        warnings.push(mkW(`Base image "${imageStr}" not pinned to digest.`, lineNum));
      }

      const jobId = alias || `stage-${totalStages - 1}`;
      const jobName = `Build stage: ${alias || (totalStages - 1)}`;

      currentJob = {
        id: jobId,
        name: jobName,
        steps: [],
        needs: [],
        env: [],
        secrets: [],
        services: [],
        runsOn: { type: RunnerType.UNKNOWN, labels: [], image: null },
        conditions: [],
        strategy: null,
        timeoutMinutes: null,
        continueOnError: false,
        retryStrategy: null,
        artifacts: [],
        container: {
          image: imageStr,
          imageRef,
          env: [],
          ports: [],
          volumes: []
        }
      };
      jobs.push(currentJob);
      currentUser = "root"; // reset per stage
      stepIndex = 0;
      continue;
    }

    if (!currentJob) {
      if (instruction === "ARG") {
        // Global ARG before FROM
        const argMatch = args.match(/^([a-zA-Z0-9_]+)(?:=(.*))?$/);
        if (argMatch) {
          const key = argMatch[1]!;
          const ev = parseEnvVar(key, argMatch[2] ?? "");
          ev.isDynamic = true;
          globalEnv.push(ev);
          if (ev.containsSecret) warnings.push(mkW(`ARG "${key}" used for secrets appears in docker history.`, lineNum));
        }
      }
      continue;
    }

    const mkStep = (name: string, type: StepType, runCmd: string | null): Step => {
      return {
        id: `${currentJob!.id}-step-${stepIndex++}`,
        name,
        type,
        run: runCmd,
        uses: null,
        actionRef: null,
        with: {},
        env: [],
        conditions: [],
        continueOnError: false,
        timeoutMinutes: null
      };
    };

    switch (instruction) {
      case "RUN": {
        runCount++;
        let cmd = args;
        if (cmd.startsWith("[")) {
          try {
            const arr = JSON.parse(cmd);
            cmd = arr.join(" ");
          } catch (e) { /* ignore */ }
        }

        const step = mkStep(`RUN ${cmd.slice(0, 30)}...`, StepType.RUN, cmd);
        currentJob.steps.push(step);

        const foundSecrets = scanForSecrets(cmd, true);
        for (const s of foundSecrets) {
          if (!currentJob.secrets.some((js) => js.name === s.name && js.source === s.source)) {
            currentJob.secrets.push(s);
          }
        }
        if (foundSecrets.some(s => s.source === SecretSource.HARDCODED)) {
          warnings.push(mkW(`Secrets or tokens visible in RUN commands.`, lineNum));
        }

        const lc = cmd.toLowerCase();
        if (lc.includes("apt-get install") && !lc.includes("--no-install-recommends")) {
          warnings.push(mkW(`apt-get install without --no-install-recommends.`, lineNum));
        }
        if (lc.includes("npm install") && !lc.includes("npm ci")) {
          warnings.push(mkW(`RUN npm install instead of npm ci.`, lineNum));
        }
        if (lc.includes("pip install") && !lc.includes("--no-cache-dir")) {
          warnings.push(mkW(`pip install without --no-cache-dir.`, lineNum));
        }
        if (lc.includes("curl ") && (lc.includes(" | bash") || lc.includes(" | sh"))) {
          warnings.push(mkW(`curl | bash or wget | sh in RUN.`, lineNum));
        }
        if (lc.includes("sudo ")) {
          warnings.push(mkW(`sudo usage.`, lineNum));
        }
        if (lc.includes("chmod 777")) {
          warnings.push(mkW(`chmod 777 usage.`, lineNum));
        }
        break;
      }
      case "CMD":
      case "ENTRYPOINT": {
        const isExec = args.startsWith("[");
        if (!isExec) {
          warnings.push(mkW(`CMD in shell form instead of exec form.`, lineNum));
        }
        const stepName = instruction === "CMD" ? "Container entrypoint (CMD)" : "Container entrypoint";
        currentJob.steps.push(mkStep(stepName, StepType.RUN, args));
        break;
      }
      case "EXPOSE": {
        const ports = args.split(/\s+/);
        for (const p of ports) {
          const num = parseInt(p.split("/")[0]!, 10);
          if (!isNaN(num)) exposedPorts.push(num);
        }
        break;
      }
      case "ENV": {
        if (!args.includes("=") && args.includes(" ")) {
          warnings.push(mkW(`Legacy ENV format.`, lineNum));
          const firstSpace = args.indexOf(" ");
          const k = args.slice(0, firstSpace);
          const v = args.slice(firstSpace + 1);
          const ev = parseEnvVar(k, v);
          currentJob.env.push(ev);
        } else {
          // split by space, respecting quotes... simplified parsing:
          const parts = args.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
          for (const p of parts) {
            const eq = p.indexOf("=");
            if (eq !== -1) {
              const ev = parseEnvVar(p.slice(0, eq), p.slice(eq + 1).replace(/^"|"$/g, ''));
              currentJob.env.push(ev);
            }
          }
        }
        break;
      }
      case "ARG": {
        const argMatch = args.match(/^([a-zA-Z0-9_]+)(?:=(.*))?$/);
        if (argMatch) {
          const key = argMatch[1]!;
          const ev = parseEnvVar(key, argMatch[2] ?? "");
          ev.isDynamic = true;
          currentJob.env.push(ev);
          if (ev.containsSecret) warnings.push(mkW(`ARG used for secrets (appears in image history).`, lineNum));
        }
        break;
      }
      case "COPY": {
        if (args.trim() === ". .") {
          warnings.push(mkW(`COPY . . without dockerignore warning.`, lineNum));
        }
        break;
      }
      case "ADD": {
        const isUrl = /^https?:\/\//i.test(args);
        const isTar = /\.tar(?:\.gz|\.bz2|\.xz)?\s/.test(args);
        if (!isUrl && !isTar) {
          warnings.push(mkW(`ADD used instead of COPY (without URL/tar justification).`, lineNum));
        }
        break;
      }
      case "WORKDIR": {
        break;
      }
      case "USER": {
        currentUser = args.trim();
        break;
      }
      case "HEALTHCHECK": {
        hasHealthcheck = true;
        break;
      }
      case "ONBUILD": {
        warnings.push(mkW(`ONBUILD usage.`, lineNum));
        break;
      }
    }
  }

  if (jobs.length > 0) {
    if (currentUser === "root") {
      warnings.push(mkW(`No USER instruction — runs as root.`, 0));
    }
    if (!hasHealthcheck) {
      warnings.push(mkW(`No HEALTHCHECK instruction.`, 0));
    }
    if (runCount > 20) {
      warnings.push(mkW(`Large number of layers (more than 20 RUN instructions total).`, 0));
    }
  }

  const hasSecrets = globalEnv.some(e => e.containsSecret) || jobs.some(j => j.env.some(e => e.containsSecret) || j.secrets.length > 0);
  const totalSteps = jobs.reduce((acc, j) => acc + j.steps.length, 0);

  const metadata: WorkflowMetadata = {
    name: null,
    description: null,
    totalJobs: totalStages,
    totalSteps: totalSteps,
    hasDockerImages: true,
    hasSecrets,
    hasExternalActions: false,
    ciSystem: "dockerfile",
  };

  const workflow: NormalizedWorkflow = {
    id: randomUUID(),
    source: WorkflowSource.DOCKERFILE,
    sourceFile: filePath,
    repoId,
    parsedAt: new Date(),
    jobs,
    triggers: [],
    globalEnv,
    globalSecrets,
    permissions: [],
    metadata: {
      ...metadata,
      isMultiStage,
      totalStages,
      exposedPorts,
      hasHealthcheck,
      runsAsRoot: currentUser === "root"
    } as WorkflowMetadata & Record<string, unknown>
  };

  return {
    success: errors.length === 0,
    result: workflow,
    errors,
    warnings
  };
}
