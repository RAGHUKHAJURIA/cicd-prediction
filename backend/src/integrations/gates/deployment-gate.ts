export interface GateConfig {
  enabled: boolean;
  blockOnGrades: Array<'D' | 'F'>;
  blockOnCritical: boolean;
  maxScore: number;
  allowedToOverride: string[];
}

export interface GateDecision {
  shouldBlock: boolean;
  reason: string;
  overridable: boolean;
  details: {
    riskGrade: string;
    riskScore: number;
    criticalCount: number;
    highCount: number;
    blockedBy: string[];
  };
}

import { ScanDetail } from '../../types/shared.types';
import crypto from 'crypto';

export class DeploymentGate {
  evaluate(scan: ScanDetail, config: GateConfig): GateDecision {
    const details = {
      riskGrade: scan.riskGrade,
      riskScore: scan.riskScore,
      criticalCount: scan.criticalCount,
      highCount: scan.highCount,
      blockedBy: scan.findings.critical.map(f => f.ruleId),
    };

    if (!config.enabled) {
      return { shouldBlock: false, reason: 'Gates disabled', overridable: false, details };
    }

    if (config.blockOnGrades.includes(scan.riskGrade as any)) {
      return {
        shouldBlock: true,
        reason: `Blocked by risk grade ${scan.riskGrade}`,
        overridable: true,
        details,
      };
    }

    if (config.blockOnCritical && scan.criticalCount > 0) {
      return {
        shouldBlock: true,
        reason: `Blocked due to ${scan.criticalCount} critical findings`,
        overridable: true,
        details,
      };
    }

    if (scan.riskScore > config.maxScore) {
      return {
        shouldBlock: true,
        reason: `Blocked by risk score ${scan.riskScore} (max allowed: ${config.maxScore})`,
        overridable: true,
        details,
      };
    }

    return { shouldBlock: false, reason: 'Passed', overridable: false, details };
  }

  generateOverrideToken(repoId: string, scanId: string, userId: string): string {
    // Generate a simple token. In reality, sign a JWT.
    const payload = `${repoId}:${scanId}:${userId}:${Date.now()}`;
    const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET || 'secret');
    return Buffer.from(payload + ':' + hmac.update(payload).digest('hex')).toString('base64');
  }

  async recordOverride(token: string, reason: string): Promise<void> {
    // Would decode and verify token, then write to DB
    console.log(`Override recorded: ${reason}`);
  }
}
