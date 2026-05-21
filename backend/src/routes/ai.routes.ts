import { Router, Request, Response } from 'express';
import { aiOrchestrator } from '../ai';
import { explanationEngine } from '../ai';
import { failurePredictor } from '../ai';
import { outputValidator } from '../ai';
import { db } from '../db';
import { scans, findings as findingsTable, parsedArtifacts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AIFinding } from '../engine/report-builder';

export const aiRoutes = Router();

aiRoutes.post('/scans/:scanId/explain', async (req: Request, res: Response) => {
  try {
    const { scanId } = req.params;
    
    const scanRecord = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1).then(r => r[0]);
    if (!scanRecord) return res.status(404).json({ error: "Scan not found" });
    if (scanRecord.status !== 'completed') return res.status(409).json({ error: "Scan must be completed before AI analysis", code: "SCAN_NOT_COMPLETE" });
    
    const s = scanRecord as any;
    if (!s.analysisReport || !s.analysisReport.aiContext) {
      return res.status(422).json({ error: "Scan has no analysis report", code: "NO_ANALYSIS" });
    }
    
    const aiContext = s.analysisReport.aiContext;
    
    const existingJobs = aiOrchestrator.getActiveJobs().filter(j => j.scanId === scanId && j.taskType === 'explain');
    if (existingJobs.length > 0) {
      return res.status(409).json({ error: "An explain job is already running", code: "JOB_IN_PROGRESS", details: { existingJobId: existingJobs[0].jobId } });
    }
    
    const jobId = await aiOrchestrator.startExplainJob(scanId, scanRecord.repoId, aiContext);
    
    return res.status(202).json({
      success: true,
      message: "Explanation generation started",
      data: {
        jobId, scanId, status: "pending",
        pollUrl: `/api/scans/${scanId}/explain/${jobId}`
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

aiRoutes.get('/scans/:scanId/explain/:jobId', (req: Request, res: Response) => {
  const { scanId, jobId } = req.params;
  const job = aiOrchestrator.getJob(jobId);
  
  if (!job) return res.status(404).json({ error: "AI job not found" });
  if (job.scanId !== scanId) return res.status(404).json({ error: "Job does not belong to this scan" });
  
  if (job.status === 'pending' || job.status === 'running') {
    return res.status(200).json({
      success: true,
      data: {
        jobId, status: job.status, progress: job.progress,
        message: "Generating AI explanation...",
        pollAfterMs: 2000
      }
    });
  }
  
  if (job.status === 'completed') {
    return res.status(200).json({
      success: true,
      data: {
        jobId, status: "completed",
        explanation: job.result?.explanation,
        findingExplanations: job.result?.findingExplanations,
        completedAt: job.completedAt,
        costUsd: job.costUsd
      }
    });
  }
  
  if (job.status === 'failed') {
    return res.status(200).json({
      success: false,
      data: {
        jobId, status: "failed",
        error: job.error,
        message: "AI explanation generation failed"
      }
    });
  }
  
  return res.status(500).json({ error: "Unknown job status" });
});

aiRoutes.post('/scans/:scanId/remediate', async (req: Request, res: Response) => {
  try {
    const { scanId } = req.params;
    
    const scanRecord = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1).then(r => r[0]);
    if (!scanRecord) return res.status(404).json({ error: "Scan not found" });
    if (scanRecord.status !== 'completed') return res.status(409).json({ error: "Scan must be completed before AI analysis", code: "SCAN_NOT_COMPLETE" });
    const s = scanRecord as any;
    if (!s.analysisReport || !s.analysisReport.aiContext) return res.status(422).json({ error: "Scan has no analysis report", code: "NO_ANALYSIS" });
    
    const aiContext = s.analysisReport.aiContext;
    const findingsList = s.analysisReport.findings?.all || [];
    
    const artifacts = await db.select().from(parsedArtifacts).where(eq(parsedArtifacts.scanId, scanId));
    const workflowContents = new Map<string, string>();
    for (const art of artifacts) {
      const a = art as any;
      if (a.filePath && a.rawContent) workflowContents.set(a.filePath, a.rawContent);
    }
    
    const existingJobs = aiOrchestrator.getActiveJobs().filter(j => j.scanId === scanId && j.taskType === 'remediate');
    if (existingJobs.length > 0) return res.status(409).json({ error: "A remediate job is already running", code: "JOB_IN_PROGRESS" });
    
    const jobId = await aiOrchestrator.startRemediateJob(scanId, scanRecord.repoId, aiContext, findingsList, workflowContents);
    
    return res.status(202).json({
      success: true,
      message: "Remediation generation started",
      data: { jobId, scanId, status: "pending", pollUrl: `/api/scans/${scanId}/remediate/${jobId}` }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

aiRoutes.get('/scans/:scanId/remediate/:jobId', (req: Request, res: Response) => {
  const { scanId, jobId } = req.params;
  const job = aiOrchestrator.getJob(jobId);
  if (!job || job.scanId !== scanId) return res.status(404).json({ error: "AI job not found" });
  
  if (job.status === 'pending' || job.status === 'running') {
    return res.status(200).json({ success: true, data: { jobId, status: job.status, progress: job.progress, pollAfterMs: 2000 } });
  }
  
  if (job.status === 'completed') {
    const rReport = job.result?.remediationReport;
    const guardrailSummary = job.result?.guardrailResults ? {
      total: job.result.guardrailResults.length,
      approved: job.result.guardrailResults.filter(g => g.approved).length,
      rejected: job.result.guardrailResults.filter(g => !g.approved).length,
      fallbacksUsed: job.result.guardrailResults.filter(g => g.usedFallback).length
    } : undefined;
    
    return res.status(200).json({
      success: true,
      data: {
        jobId, status: "completed",
        remediationReport: rReport,
        guardrailResults: guardrailSummary,
        patchesReady: guardrailSummary?.approved || 0,
        completedAt: job.completedAt,
        costUsd: job.costUsd
      }
    });
  }
  return res.status(200).json({ success: false, data: { jobId, status: "failed", error: job.error } });
});

aiRoutes.post('/scans/:scanId/ai-report', async (req: Request, res: Response) => {
  try {
    const { scanId } = req.params;
    const scanRecord = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1).then(r => r[0]);
    if (!scanRecord) return res.status(404).json({ error: "Scan not found" });
    if (scanRecord.status !== 'completed') return res.status(409).json({ error: "Scan not complete" });
    
    const s = scanRecord as any;
    const aiContext = s.analysisReport?.aiContext;
    const findingsList = s.analysisReport?.findings?.all || [];
    
    const artifacts = await db.select().from(parsedArtifacts).where(eq(parsedArtifacts.scanId, scanId));
    const workflowContents = new Map<string, string>();
    for (const art of artifacts) {
      const a = art as any;
      if (a.filePath && a.rawContent) workflowContents.set(a.filePath, a.rawContent);
    }
    
    const existingJobs = aiOrchestrator.getActiveJobs().filter(j => j.scanId === scanId && j.taskType === 'full-report');
    if (existingJobs.length > 0) return res.status(409).json({ error: "Job already running" });
    
    const jobId = await aiOrchestrator.startFullReportJob(scanId, scanRecord.repoId, aiContext, findingsList, workflowContents);
    return res.status(202).json({ success: true, data: { jobId, scanId, status: "pending", pollUrl: `/api/scans/${scanId}/ai-report/${jobId}` } });
  } catch (e: any) { return res.status(500).json({ success: false, error: e.message }); }
});

aiRoutes.get('/scans/:scanId/ai-report/:jobId', (req: Request, res: Response) => {
  const { scanId, jobId } = req.params;
  const job = aiOrchestrator.getJob(jobId);
  if (!job || job.scanId !== scanId) return res.status(404).json({ error: "Job not found" });
  if (job.status === 'pending' || job.status === 'running') return res.status(200).json({ success: true, data: { jobId, status: job.status, progress: job.progress } });
  if (job.status === 'failed') return res.status(200).json({ success: false, data: { jobId, status: "failed", error: job.error } });
  return res.status(200).json({ success: true, data: { jobId, status: "completed", report: job.result?.fullReport, completedAt: job.completedAt, costUsd: job.result?.fullReport?.totalCostUsd } });
});

aiRoutes.get('/scans/:scanId/ai-report/:jobId/status', (req: Request, res: Response) => {
  const { scanId, jobId } = req.params;
  const job = aiOrchestrator.getJob(jobId);
  if (!job || job.scanId !== scanId) return res.status(404).json({ error: "Job not found" });
  
  let currentPhase = 'done';
  let estimatedSecondsRemaining: number | null = 0;
  if (job.status === 'pending') {
    currentPhase = 'explanation';
    estimatedSecondsRemaining = 30;
  } else if (job.status === 'running') {
    if (job.progress < 33) currentPhase = 'explanation';
    else if (job.progress < 66) currentPhase = 'prediction';
    else currentPhase = 'remediation';
    estimatedSecondsRemaining = Math.max(0, 30 - ((Date.now() - job.startedAt.getTime()) / 1000));
  }
  
  return res.status(200).json({ success: true, data: { jobId, status: job.status, progress: job.progress, currentPhase, estimatedSecondsRemaining } });
});

aiRoutes.post('/findings/:findingId/explain', async (req: Request, res: Response) => {
  try {
    const { findingId } = req.params;
    const fRecord = await db.select().from(findingsTable).where(eq(findingsTable.id, findingId)).limit(1).then(r => r[0]);
    if (!fRecord) return res.status(404).json({ error: "Finding not found" });
    
    const fr = fRecord as any;
    const finding: AIFinding = { ruleId: fr.ruleId, title: fr.ruleName || fr.title, filePath: fr.filePath, evidence: fr.evidence || '', remediation: fr.remediation || '', severity: fr.severity, category: fr.category };
    const result = await explanationEngine.explainFinding(finding, {} as any, fRecord.scanId);
    if (!result.success) {
      return res.status(503).json({ success: false, error: "AI explanation service unavailable", code: "AI_UNAVAILABLE", fallback: { plainEnglishRisk: finding.title, remediation: finding.remediation } });
    }
    
    const validate = outputValidator.validateFindingExplanation(result.data);
    return res.status(200).json({ success: true, data: { findingId, explanation: validate.sanitized ?? result.data, generatedAt: new Date().toISOString(), costUsd: result.raw?.cost?.totalCostUsd } });
  } catch (e: any) { return res.status(500).json({ success: false, error: e.message }); }
});

aiRoutes.post('/findings/:findingId/predict', async (req: Request, res: Response) => {
  try {
    const { findingId } = req.params;
    const fRecord = await db.select().from(findingsTable).where(eq(findingsTable.id, findingId)).limit(1).then(r => r[0]);
    if (!fRecord) return res.status(404).json({ error: "Finding not found" });
    
    const fr = fRecord as any;
    const finding: AIFinding = { ruleId: fr.ruleId, title: fr.ruleName || fr.title, filePath: fr.filePath, evidence: fr.evidence || '', remediation: fr.remediation || '', severity: fr.severity, category: fr.category };
    const result = await failurePredictor.predictSingleFinding(finding, fRecord.scanId, 'repoId');
    if (!result.success) {
      return res.status(503).json({ success: false, fallback: { failureMode: finding.title, likelihood: 'unknown', impact: 'unknown' } });
    }
    return res.status(200).json({ success: true, data: result.data });
  } catch (e: any) { return res.status(500).json({ success: false, error: e.message }); }
});
