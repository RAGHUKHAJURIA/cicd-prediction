export enum AITaskType {
  EXPLAIN = 'explain',
  REMEDIATE = 'remediate',
  PREDICT = 'predict',
  SUMMARIZE = 'summarize'
}

export const SYSTEM_PROMPTS: Record<AITaskType, string> = {
  [AITaskType.EXPLAIN]: `You are a senior DevOps engineer and CI/CD reliability expert.
You are analyzing CI/CD pipeline configurations for reliability
and security risks. Your job is to explain technical findings
in clear, practical language that a developer can act on.

Rules you must follow:
- Explain findings in plain English, not jargon
- Always explain the specific failure scenario: "This will cause X
  when Y happens in a production environment"
- Be concise — each explanation should be 2-4 sentences maximum
- Never invent findings that are not in the provided data
- Never say "I" — write in second person ("Your pipeline...")
- Format your response as valid JSON matching the schema provided
- If a finding is unclear, explain what you do know, not what you don't`,

  [AITaskType.REMEDIATE]: `You are a senior DevOps engineer specializing in CI/CD configuration
and infrastructure as code. Your job is to generate concrete,
copy-pasteable fixes for pipeline configuration issues.

Rules you must follow:
- Generate ONLY fixes for findings explicitly listed in the input
- Every fix must be a complete, valid configuration snippet
- Show the BEFORE state and AFTER state for every fix
- For Docker image pinning, use the format: image@sha256:{digest}
  but use a realistic placeholder digest, not a real one —
  instruct the user to replace it with the actual digest
- For GitHub Actions pinning, show how to find the real SHA
- Never generate fixes that would break the pipeline
- Format your response as valid JSON matching the schema provided
- If you cannot generate a safe fix for a finding, say so explicitly
  in the fix field — do not hallucinate a broken patch`,

  [AITaskType.PREDICT]: `You are a senior site reliability engineer with deep experience
in CI/CD pipeline failures and production incidents. Your job is
to predict concrete failure scenarios based on pipeline
configuration risks.

Rules you must follow:
- For each finding, predict a SPECIFIC real-world failure scenario
- Include: what triggers the failure, what breaks, what the
  impact is (data loss, downtime, security breach, etc.)
- Reference real incident patterns where relevant
  (e.g. "The 2020 SolarWinds breach exploited unpinned builds")
- Be direct and specific — avoid vague statements like "may cause issues"
- Assign a likelihood: LIKELY (>50%), POSSIBLE (10-50%), RARE (<10%)
- Format your response as valid JSON matching the schema provided`,

  [AITaskType.SUMMARIZE]: `You are a senior engineering leader providing a CI/CD reliability
assessment. Your job is to write a clear executive summary that
communicates risk level, key findings, and recommended priorities
to both technical and non-technical stakeholders.

Rules you must follow:
- Write in clear, professional English
- Lead with the risk grade and overall assessment
- Highlight the top 3 most important issues only
- End with a concrete recommended next step
- Keep the summary under 200 words
- Do NOT use bullet points — write in paragraphs
- Format your response as valid JSON matching the schema provided`
};

export interface ExplainedFinding {
  ruleId: string;
  explanation: string;
  riskContext: string;
  urgency: 'immediate' | 'soon' | 'low';
}

export interface ExplainOutput {
  findings: ExplainedFinding[];
  generatedAt: string;
}

export interface RemediationPatch {
  ruleId: string;
  title: string;
  before: string;
  after: string;
  language: 'yaml' | 'dockerfile' | 'groovy' | 'shell';
  instructions: string;
  safe: boolean;
  warning: string | null;
}

export interface RemediateOutput {
  patches: RemediationPatch[];
  generatedAt: string;
}

export interface FailurePrediction {
  ruleId: string;
  scenario: string;
  trigger: string;
  impact: string;
  likelihood: 'likely' | 'possible' | 'rare';
  timeToFailure: string;
}

export interface PredictOutput {
  predictions: FailurePrediction[];
  worstCaseScenario: string;
  generatedAt: string;
}

export interface SummarizeOutput {
  executiveSummary: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'clean';
  topThreeIssues: string[];
  recommendedNextStep: string;
  estimatedFixTime: string;
  generatedAt: string;
}

export const OUTPUT_SCHEMAS: Record<AITaskType, string> = {
  [AITaskType.EXPLAIN]: JSON.stringify({
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ruleId: { type: "string" },
            explanation: { type: "string" },
            riskContext: { type: "string" },
            urgency: { type: "string", enum: ["immediate", "soon", "low"] }
          },
          required: ["ruleId", "explanation", "riskContext", "urgency"],
          additionalProperties: false
        }
      },
      generatedAt: { type: "string", format: "date-time" }
    },
    required: ["findings", "generatedAt"],
    additionalProperties: false
  }, null, 2),

  [AITaskType.REMEDIATE]: JSON.stringify({
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      patches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ruleId: { type: "string" },
            title: { type: "string" },
            before: { type: "string" },
            after: { type: "string" },
            language: { type: "string", enum: ["yaml", "dockerfile", "groovy", "shell"] },
            instructions: { type: "string" },
            safe: { type: "boolean" },
            warning: { type: ["string", "null"] }
          },
          required: ["ruleId", "title", "before", "after", "language", "instructions", "safe", "warning"],
          additionalProperties: false
        }
      },
      generatedAt: { type: "string", format: "date-time" }
    },
    required: ["patches", "generatedAt"],
    additionalProperties: false
  }, null, 2),

  [AITaskType.PREDICT]: JSON.stringify({
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      predictions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ruleId: { type: "string" },
            scenario: { type: "string" },
            trigger: { type: "string" },
            impact: { type: "string" },
            likelihood: { type: "string", enum: ["likely", "possible", "rare"] },
            timeToFailure: { type: "string" }
          },
          required: ["ruleId", "scenario", "trigger", "impact", "likelihood", "timeToFailure"],
          additionalProperties: false
        }
      },
      worstCaseScenario: { type: "string" },
      generatedAt: { type: "string", format: "date-time" }
    },
    required: ["predictions", "worstCaseScenario", "generatedAt"],
    additionalProperties: false
  }, null, 2),

  [AITaskType.SUMMARIZE]: JSON.stringify({
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      executiveSummary: { type: "string" },
      riskLevel: { type: "string", enum: ["critical", "high", "medium", "low", "clean"] },
      topThreeIssues: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 3
      },
      recommendedNextStep: { type: "string" },
      estimatedFixTime: { type: "string" },
      generatedAt: { type: "string", format: "date-time" }
    },
    required: ["executiveSummary", "riskLevel", "topThreeIssues", "recommendedNextStep", "estimatedFixTime", "generatedAt"],
    additionalProperties: false
  }, null, 2)
};

export function buildExplainPrompt(serializedContext: string, _options?: { maxFindings?: number }): string {
  return `---
Analyze the following CI/CD pipeline scan results and explain
each finding in plain English.

## Scan Context
${serializedContext}

## Your Task
For each finding listed above, provide:
1. A plain English explanation of why this configuration is risky
2. The specific failure scenario it could cause in production
3. An urgency level (immediate/soon/low)

Return your response as valid JSON matching this exact schema:
${OUTPUT_SCHEMAS[AITaskType.EXPLAIN]}

Important: Your response must be valid JSON only.
Do not include markdown code fences, preamble, or explanation text.
Only output the JSON object.
---`;
}

export function buildRemediatePrompt(serializedContext: string, _options?: { maxPatches?: number; includeDockerPin?: boolean }): string {
  return `---
Generate concrete configuration fixes for the following
CI/CD pipeline findings.

## Scan Context
${serializedContext}

## Your Task
For each finding, generate a copy-pasteable configuration fix.
Show the current broken configuration and the corrected version.

Important constraints:
- Only generate fixes for findings explicitly listed above
- Every YAML snippet must be syntactically valid
- For Docker image pinning: use format image:tag@sha256:{placeholder}
  and tell the user to replace {placeholder} with the real digest
  found by running: docker pull image:tag && docker inspect image:tag
- For GitHub Actions pinning: show the user how to find the commit SHA
  at github.com/{owner}/{repo}/releases

Return your response as valid JSON matching this exact schema:
${OUTPUT_SCHEMAS[AITaskType.REMEDIATE]}

Important: Your response must be valid JSON only.
---`;
}

export function buildPredictPrompt(serializedContext: string, _options?: { includeWorstCase?: boolean }): string {
  return `---
Based on the following CI/CD pipeline findings, predict the
specific failure scenarios these configurations will cause.

## Scan Context
${serializedContext}

## Your Task
For each finding, predict:
1. The specific event that would trigger this failure
2. What would break and what the production impact would be
3. How likely this failure is (likely/possible/rare)
4. When it would most likely occur

Also provide a single worst-case scenario if ALL findings
go unfixed simultaneously.

Return your response as valid JSON matching this exact schema:
${OUTPUT_SCHEMAS[AITaskType.PREDICT]}

Important: Your response must be valid JSON only.
---`;
}

export function buildSummarizePrompt(serializedContext: string): string {
  return `---
Write an executive summary of the following CI/CD reliability
scan results.

## Scan Context
${serializedContext}

## Your Task
Write a professional assessment that:
1. States the overall risk grade and what it means
2. Identifies the top 3 most critical issues
3. Recommends the single most important next action
4. Estimates how long the top issues would take to fix

Keep the executive summary under 200 words.
Write in paragraphs, not bullet points.

Return your response as valid JSON matching this exact schema:
${OUTPUT_SCHEMAS[AITaskType.SUMMARIZE]}

Important: Your response must be valid JSON only.
---`;
}
