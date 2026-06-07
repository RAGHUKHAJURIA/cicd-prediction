// @ts-nocheck
import { SlackClient } from './slack-client';
import { ScanDetail, RepoSummary, ScanSummary } from '../../types/shared.types';
import { formatCriticalAlert, formatGradeChangeAlert } from './alert-formatter';
import { CacheClient } from '../../cache/cache.client';

export interface SlackConfig {
  enabled: boolean;
  webhookUrl: string;
  alertOnCritical: boolean;
  alertOnDegradation: boolean;
  gradeThreshold: 'A' | 'B' | 'C' | 'D' | 'F';
  channel?: string;
}

export class SlackNotifier {
  private cache: CacheClient;

  constructor(private client: SlackClient) {
    this.cache = new CacheClient('slack:');
  }

  async notifyIfNeeded(
    scan: ScanDetail,
    repo: RepoSummary,
    previousScan: ScanSummary | null,
    config: SlackConfig,
    dashboardUrl: string
  ): Promise<void> {
    if (!config.enabled || !config.webhookUrl) return;

    // Deduplication check
    const dedupKey = `alerted:${scan.id}`;
    if (await this.cache.get(dedupKey)) return;

    const gradeValue = (g: string) => {
      const map: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
      return map[g] || 5;
    };

    let sent = false;

    // Condition A: Critical findings
    if (config.alertOnCritical && scan.criticalCount > 0) {
      await this.client.send(formatCriticalAlert(scan, repo, dashboardUrl));
      sent = true;
    }

    // Condition B: Grade below threshold
    if (!sent && gradeValue(scan.riskGrade) <= gradeValue(config.gradeThreshold)) {
      await this.client.send(formatCriticalAlert(scan, repo, dashboardUrl)); // reusing critical alert format for simplicity, ideally a custom one
      sent = true;
    }

    // Condition C: Degradation
    if (!sent && config.alertOnDegradation && previousScan) {
      if (gradeValue(scan.riskGrade) < gradeValue(previousScan.riskGrade)) {
        await this.client.send(formatGradeChangeAlert(repo, previousScan.riskGrade, scan.riskGrade, scan, dashboardUrl));
        sent = true;
      }
    }

    if (sent) {
      // 24 hour dedup TTL
      await this.cache.set(dedupKey, true, 24 * 60 * 60);
    }
  }
}
