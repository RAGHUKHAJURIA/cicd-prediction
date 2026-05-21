import { v4 as uuidv4 } from 'uuid';
import { ExplanationEngine, explanationEngine } from './explanation-engine';
import { FailurePredictor, failurePredictor } from './failure-predictor';
import { RemediationGenerator, remediationGenerator, ScanRemediationReport, ValidationStatus } from './remediation-generator';
import { Guardrail, guardrail, GuardrailResult } from './guardrail';
import { FallbackGenerator, fallbackGenerator } from './fallback-generator';
import { OutputValidator, outputValidator } from './output-validator';
import { ScanExplanation, FindingExplanation, FailurePrediction } from './ai-response.types';
import { AIContext, AIFinding } from '../engine/report-builder';

export interface AIJobStatus {
  jobId: string;
  scanId: string;
  repoId: string;
  taskType: 'explain' | 'remediate' | 'full-report';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startedAt: Date;
  completedAt?: Date;
  result?: AIJobResult;
  error?: string;
  costUsd?: number;
}

export interface AIJobResult {
  jobId: string;
  taskType: string;
  explanation?: ScanExplanation;
  findingExplanations?: Record<string, FindingExplanation>;
  failurePrediction?: FailurePrediction;
  remediationReport?: ScanRemediationReport;
  guardrailResults?: GuardrailResult[];
  fullReport?: AIFullReport;
}

export interface AIFullReport {
  scanId: string;
  repoId: string;
  generatedAt: Date;
  explanation: ScanExplanation;
  failurePrediction: FailurePrediction;
  remediationReport: ScanRemediationReport;
  topFindingExplanations: FindingExplanation[];
  guardrailSummary: {
    totalPatches: number;
    approvedPatches: number;
    rejectedPatches: number;
    fallbacksUsed: number;
  };
  totalCostUsd: number;
  generationTimeMs: number;
}

export class AIOrchestrator {
  private jobs: Map<string, AIJobStatus> = new Map();

  constructor(
    private explanationEng: ExplanationEngine = explanationEngine,
    private failurePred: FailurePredictor = failurePredictor,
    private remediationGen: RemediationGenerator = remediationGenerator,
    private guardrailInst: Guardrail = guardrail,
    private fallbackGen: FallbackGenerator = fallbackGenerator,
    private validator: OutputValidator = outputValidator
  ) {}

  async startExplainJob(
    scanId: string,
    repoId: string,
    aiContext: AIContext
  ): Promise<string> {
    const jobId = uuidv4();
    this.jobs.set(jobId, {
      jobId, scanId, repoId, taskType: 'explain',
      status: 'pending', progress: 0, startedAt: new Date()
    });

    setImmediate(() => this.processExplainJob(jobId, scanId, repoId, aiContext));
    return jobId;
  }

  private async processExplainJob(
    jobId: string,
    scanId: string,
    _repoId: string,
    aiContext: AIContext
  ): Promise<void> {
    try {
      this.updateJobStatus(jobId, { status: 'running', progress: 0 });

      // STEP 1
      const explanationResult = await this.explanationEng.explainScan(aiContext, scanId);
      if (!explanationResult.success) {
        throw new Error("Explanation failed: " + explanationResult.error?.message);
      }

      const validate = this.validator.validateScanExplanation(explanationResult.data);
      if (!validate.valid && validate.errors.length > 0) {
        console.warn("Explanation validation warnings:", validate.errors);
      }
      const explanation = (validate.sanitized as ScanExplanation) ?? explanationResult.data;
      this.updateJobStatus(jobId, { progress: 60 });

      // STEP 2
      const topFindings = [
        ...(aiContext.criticalFindings || []).slice(0, 3),
        ...(aiContext.highFindings || []).slice(0, 2)
      ];
      const findingExplanationsMap = await this.explanationEng.explainMultipleFindings(
        topFindings, aiContext, scanId, { maxFindings: 5 }
      );
      this.updateJobStatus(jobId, { progress: 100 });

      this.updateJobStatus(jobId, {
        status: 'completed',
        completedAt: new Date(),
        result: {
          jobId, taskType: 'explain',
          explanation,
          findingExplanations: this.mapSuccessfulExplanations(findingExplanationsMap)
        }
      });
    } catch (err: any) {
      this.updateJobStatus(jobId, {
        status: 'failed',
        error: err.message,
        completedAt: new Date()
      });
    }
  }

  async startRemediateJob(
    scanId: string,
    repoId: string,
    aiContext: AIContext,
    findings: AIFinding[],
    workflowContents: Map<string, string>
  ): Promise<string> {
    const jobId = uuidv4();
    this.jobs.set(jobId, {
      jobId, scanId, repoId, taskType: 'remediate',
      status: 'pending', progress: 0, startedAt: new Date()
    });

    setImmediate(() => this.processRemediateJob(jobId, scanId, repoId, aiContext, findings, workflowContents));
    return jobId;
  }

  private async processRemediateJob(
    jobId: string,
    scanId: string,
    _repoId: string,
    aiContext: AIContext,
    findings: AIFinding[],
    workflowContents: Map<string, string>
  ): Promise<void> {
    try {
      this.updateJobStatus(jobId, { status: 'running', progress: 0 });

      // STEP 1
      const remediationReport = await this.remediationGen.generateForScan(
        scanId, aiContext, findings, workflowContents
      );
      this.updateJobStatus(jobId, { progress: 50 });

      // STEP 2
      const guardrailResults: GuardrailResult[] = [];
      const aiRemediations = remediationReport.remediations.filter(r => r.aiPatch !== null);
      const totalPatches = aiRemediations.length;

      for (let i = 0; i < totalPatches; i++) {
        const remediation = aiRemediations[i];
        const originalContent = workflowContents.get(remediation.findingFilePath) ?? '';
        
        const guardrailResult = await this.guardrailInst.validatePatch(
          originalContent,
          remediation.aiPatch!.patchedContent,
          remediation.findingFilePath,
          { ruleId: remediation.findingRuleId, filePath: remediation.findingFilePath } as AIFinding,
          remediation.aiPatch!,
          'ai-generated'
        );

        if (guardrailResult.approved) {
          remediation.validationStatus = ValidationStatus.VALID;
        } else {
          remediation.validationStatus = ValidationStatus.INVALID;
          const fallback = this.fallbackGen.generateFallback(remediation.findingRuleId, { ruleId: remediation.findingRuleId, filePath: remediation.findingFilePath } as AIFinding, guardrailResult.rejectionReason || 'Invalid');
          if (fallback && fallback.remediationSource !== 'none') {
            remediation.validationStatus = ValidationStatus.FALLBACK;
            remediation.finalRecommendation = fallback.finalRecommendation;
            remediation.patch = fallback.patch;
          }
        }

        guardrailResults.push(guardrailResult);
        this.updateJobStatus(jobId, {
          progress: 50 + Math.floor((i / Math.max(1, totalPatches)) * 40)
        });
      }

      // STEP 3
      this.updateJobStatus(jobId, {
        status: 'completed',
        completedAt: new Date(),
        result: { jobId, taskType: 'remediate', remediationReport, guardrailResults }
      });
    } catch (err: any) {
      this.updateJobStatus(jobId, { status: 'failed', error: err.message, completedAt: new Date() });
    }
  }

  async generateFullReport(
    scanId: string,
    repoId: string,
    aiContext: AIContext,
    findings: AIFinding[],
    workflowContents: Map<string, string>
  ): Promise<AIFullReport> {
    const jobId = uuidv4();
    this.jobs.set(jobId, {
      jobId, scanId, repoId, taskType: 'full-report',
      status: 'pending', progress: 0, startedAt: new Date()
    });
    await this.processFullReportJob(jobId, scanId, repoId, aiContext, findings, workflowContents);
    const result = this.jobs.get(jobId);
    if (result?.status === 'failed') throw new Error(result.error);
    if (!result?.result?.fullReport) throw new Error("Report generation failed");
    return result.result.fullReport;
  }

  async startFullReportJob(
    scanId: string,
    repoId: string,
    aiContext: AIContext,
    findings: AIFinding[],
    workflowContents: Map<string, string>
  ): Promise<string> {
    const jobId = uuidv4();
    this.jobs.set(jobId, {
      jobId, scanId, repoId, taskType: 'full-report',
      status: 'pending', progress: 0, startedAt: new Date()
    });

    setImmediate(() => this.processFullReportJob(jobId, scanId, repoId, aiContext, findings, workflowContents));
    return jobId;
  }

  private async processFullReportJob(
    jobId: string,
    scanId: string,
    repoId: string,
    aiContext: AIContext,
    findings: AIFinding[],
    workflowContents: Map<string, string>
  ): Promise<void> {
    const startTime = Date.now();
    try {
      this.updateJobStatus(jobId, { status: 'running', progress: 0 });

      // PHASE 1
      const explanationResult = await this.explanationEng.explainScan(aiContext, scanId);
      const topFindings = [...(aiContext.criticalFindings||[]), ...(aiContext.highFindings||[])].slice(0, 5);
      const topFindingExplanationsMap = await this.explanationEng.explainMultipleFindings(topFindings, aiContext, scanId, { maxFindings: 5 });
      this.updateJobStatus(jobId, { progress: 33 });

      // PHASE 2
      const failurePredictionResult = await this.failurePred.predictFailures(aiContext, scanId);
      this.updateJobStatus(jobId, { progress: 66 });

      // PHASE 3
      const remediationReport = await this.remediationGen.generateForScan(scanId, aiContext, findings, workflowContents);
      
      const validations = remediationReport.remediations.filter(r => r.aiPatch !== null).map(r => ({
        originalContent: workflowContents.get(r.findingFilePath) ?? '',
        patchedContent: r.aiPatch!.patchedContent,
        filePath: r.findingFilePath,
        finding: { ruleId: r.findingRuleId, filePath: r.findingFilePath } as AIFinding,
        patch: r.aiPatch!,
        patchSource: 'ai-generated' as const
      }));

      const guardrailResults = await this.guardrailInst.validateBatch(validations);
      
      let approvedPatches = 0;
      let rejectedPatches = 0;
      let fallbacksUsed = 0;

      for (let i = 0; i < validations.length; i++) {
        const remediation = remediationReport.remediations.find(r => r.findingFilePath === validations[i].filePath && r.findingRuleId === validations[i].finding.ruleId);
        const res = guardrailResults[i];
        if (remediation) {
          if (res.approved) {
            remediation.validationStatus = ValidationStatus.VALID;
            approvedPatches++;
          } else {
            remediation.validationStatus = ValidationStatus.INVALID;
            rejectedPatches++;
            const fallback = this.fallbackGen.generateFallback(remediation.findingRuleId, validations[i].finding, res.rejectionReason || 'Invalid');
            if (fallback && fallback.remediationSource !== 'none') {
              remediation.validationStatus = ValidationStatus.FALLBACK;
              remediation.finalRecommendation = fallback.finalRecommendation;
              remediation.patch = fallback.patch;
              fallbacksUsed++;
            }
          }
        }
      }

      this.updateJobStatus(jobId, { progress: 100 });

      const explanation = explanationResult.success ? explanationResult.data : {} as any;
      const failurePrediction = failurePredictionResult.success ? failurePredictionResult.data : {} as any;
      const topFindingExplanations = Array.from(topFindingExplanationsMap.values()).filter(x => x.success).map(x => x.data as FindingExplanation);

      const fullReport: AIFullReport = {
        scanId, repoId, generatedAt: new Date(),
        explanation, failurePrediction, remediationReport, topFindingExplanations,
        guardrailSummary: {
          totalPatches: validations.length,
          approvedPatches, rejectedPatches, fallbacksUsed
        },
        totalCostUsd: remediationReport.costUsd || 0, // In reality, sum of all
        generationTimeMs: Date.now() - startTime
      };

      this.updateJobStatus(jobId, {
        status: 'completed',
        completedAt: new Date(),
        result: { jobId, taskType: 'full-report', fullReport }
      });
    } catch (err: any) {
      this.updateJobStatus(jobId, { status: 'failed', error: err.message, completedAt: new Date() });
    }
  }

  getJob(jobId: string): AIJobStatus | null {
    return this.jobs.get(jobId) || null;
  }

  getJobResult(jobId: string): AIJobResult | null {
    const job = this.jobs.get(jobId);
    return job && job.status === 'completed' && job.result ? job.result : null;
  }

  isJobComplete(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    return !!job && (job.status === 'completed' || job.status === 'failed');
  }

  private updateJobStatus(jobId: string, updates: Partial<AIJobStatus>): void {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
    }
  }

  private mapSuccessfulExplanations(map: Map<string, any>): Record<string, FindingExplanation> {
    const obj: Record<string, FindingExplanation> = {};
    for (const [key, value] of map.entries()) {
      if (value.success && value.data) {
        obj[key] = value.data;
      }
    }
    return obj;
  }

  getActiveJobs(): AIJobStatus[] {
    return Array.from(this.jobs.values()).filter(j => j.status === 'running' || j.status === 'pending');
  }

  cleanupOldJobs(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let count = 0;
    for (const [id, job] of this.jobs.entries()) {
      if ((job.status === 'completed' || job.status === 'failed') && job.completedAt) {
        if (now - job.completedAt.getTime() > maxAgeMs) {
          this.jobs.delete(id);
          count++;
        }
      }
    }
    return count;
  }
}

export const aiOrchestrator = new AIOrchestrator();
