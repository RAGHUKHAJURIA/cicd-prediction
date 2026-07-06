export function formatPRComment(params: {
  scanId: string;
  repoId: string;
  grade: string;
  score: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  branch: string;
  findings: Array<{
    ruleId: string;
    title: string;
    severity: string;
    filePath: string;
    line: number | null;
  }>;
  hasAutoFixes: boolean;
  hasPR: boolean;
  prUrl?: string;
  dashboardUrl: string;
  scanTimestamp: string;
}): string {
  const emojis: Record<string, string> = {
    A: '✅',
    B: '🟢',
    C: '🟡',
    D: '🟠',
    F: '🔴',
  };
  const gradeEmoji = emojis[params.grade.toUpperCase()] || '⚪';

  const severityEmojiMap: Record<string, string> = {
    critical: '🔴 Critical',
    high: '🟠 High',
    medium: '🟡 Medium',
    low: '🔵 Low',
    info: '⚪ Info',
  };

  const limit = 10;
  const slicedFindings = params.findings.slice(0, limit);
  const remaining = params.findings.length - limit;

  let findingsTable = '';
  if (params.findings.length > 0) {
    findingsTable = `| Severity | Rule | File | Line |\n|----------|------|------|------|\n` +
      slicedFindings.map(f => {
        const severityStr = severityEmojiMap[f.severity.toLowerCase()] || f.severity;
        return `| ${severityStr} | \`${f.ruleId}\` | \`${f.filePath}\` | ${f.line ?? 'N/A'} |`;
      }).join('\n');
    
    if (remaining > 0) {
      findingsTable += `\n\n+ ${remaining} more findings — view full report`;
    }
  } else {
    findingsTable = '*No findings detected.*';
  }

  let footerAction = '';
  if (params.hasAutoFixes && !params.hasPR) {
    footerAction = `### 🔧 Fixes available\nRun a scan from the dashboard to generate a PR with automatic fixes.\n[View full report →](${params.dashboardUrl}/repos/${params.repoId}/scans/${params.scanId})`;
  } else if (params.hasPR) {
    footerAction = `### 🔧 Fix PR created\n[View fix PR →](${params.prUrl}) | [View full report →](${params.dashboardUrl}/repos/${params.repoId}/scans/${params.scanId})`;
  } else {
    footerAction = `[View full report →](${params.dashboardUrl}/repos/${params.repoId}/scans/${params.scanId})`;
  }

  const generatedTime = new Date(params.scanTimestamp).toLocaleString();

  return `<!-- cicd-reliability-scan-${params.repoId} -->

## CI/CD Reliability Analysis ${gradeEmoji}

**Risk Grade: ${params.grade}** | Score: ${params.score}/100 | Branch: \`${params.branch}\`

---

### Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${params.criticalCount} |
| 🟠 High | ${params.highCount} |
| 🟡 Medium | ${params.mediumCount} |
| 🔵 Low | ${params.lowCount} |

---

### ${params.totalFindings} Findings

${findingsTable}

---

${footerAction}

---
<details>
<summary>About this report</summary>
Scan ID: \`${params.scanId}\` · Generated: ${generatedTime} · Powered by CI/CD Reliability Platform
</details>
<!-- cicd-reliability-scan-end -->`;
}

export function formatCheckRunSummary(params: {
  grade: string;
  score: number;
  criticalCount: number;
  highCount: number;
  topFindings: Array<{
    ruleId: string;
    title: string;
    severity: string;
    filePath: string;
  }>;
  dashboardUrl: string;
  scanId: string;
  repoId: string;
}): { title: string; summary: string; text: string } {
  const title = `CI/CD Reliability: Grade ${params.grade} (${params.score}/100)`;
  
  const summary = `Scan completed with Risk Grade ${params.grade} (${params.score}/100). Detected ${params.criticalCount} critical and ${params.highCount} high severity findings. Please review the detailed findings table below or view the full report on the dashboard.`;

  const severityEmojiMap: Record<string, string> = {
    critical: '🔴 Critical',
    high: '🟠 High',
    medium: '🟡 Medium',
    low: '🔵 Low',
    info: '⚪ Info',
  };

  const tableHeader = `| Severity | Rule | Title | File |\n|----------|------|-------|------|\n`;
  const tableBody = params.topFindings.map(f => {
    const severityStr = severityEmojiMap[f.severity.toLowerCase()] || f.severity;
    return `| ${severityStr} | \`${f.ruleId}\` | ${f.title} | \`${f.filePath}\` |`;
  }).join('\n');

  const text = `## Top Findings

${params.topFindings.length > 0 ? tableHeader + tableBody : '*No major findings.*'}

---

[View Full Report on Dashboard](${params.dashboardUrl}/repos/${params.repoId}/scans/${params.scanId})`;

  return { title, summary, text };
}

export function formatPRBody(params: {
  scanId: string;
  grade: string;
  score: number;
  appliedFixes: Array<{ ruleId: string; filePath: string }>;
  manualFixes: Array<{
    ruleId: string;
    filePath: string;
    guidance: string;
    referenceUrl?: string;
  }>;
  patchBranch: string;
  baseBranch: string;
  dashboardUrl: string;
  repoId: string;
}): string {
  const appliedTable = params.appliedFixes.length > 0
    ? `| Rule | File |\n|------|------|\n` +
      params.appliedFixes.map(f => `| \`${f.ruleId}\` | \`${f.filePath}\` |`).join('\n')
    : '*No automated fixes were applied.*';

  const manualTable = params.manualFixes.length > 0
    ? `| Rule | File | Guidance | Reference |\n|------|------|----------|-----------|\n` +
      params.manualFixes.map(f => {
        const refLink = f.referenceUrl ? `[Reference](${f.referenceUrl})` : 'N/A';
        return `| \`${f.ruleId}\` | \`${f.filePath}\` | ${f.guidance} | ${refLink} |`;
      }).join('\n')
    : '*No manual review needed for this scan.*';

  return `## CI/CD Reliability Improvements

This PR was automatically generated by the **CI/CD Reliability Platform** in response to the scan results on branch \`${params.baseBranch}\`.

**Scan Summary:**
- **Risk Grade**: ${params.grade}
- **Risk Score**: ${params.score}/100
- **Full Report**: [View report on Dashboard](${params.dashboardUrl}/repos/${params.repoId}/scans/${params.scanId})

---

## 🔧 Automatically applied fixes

The following fixes have been applied to the branch \`${params.patchBranch}\`:

${appliedTable}

---

## ⚠️ Manual review needed

The following findings require manual review or configurations that could not be safely automated:

${manualTable}

---

*Generated by CI/CD Reliability Platform (Scan ID: \`${params.scanId}\`)*`;
}

export function formatNoFixesPRBody(params: {
  scanId: string;
  grade: string;
  findings: Array<{ ruleId: string; title: string; severity: string }>;
  dashboardUrl: string;
  repoId: string;
}): string {
  const severityEmojiMap: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🔵',
  };

  const findingsTable = params.findings.length > 0
    ? `| Severity | Rule | Title |\n|----------|------|-------|\n` +
      params.findings.map(f => {
        const emoji = severityEmojiMap[f.severity.toLowerCase()] || '';
        return `| ${emoji} ${f.severity} | \`${f.ruleId}\` | ${f.title} |`;
      }).join('\n')
    : '*No findings.*';

  return `## CI/CD Reliability Findings — manual review needed

This pull request contains only documentation or requires manual updates. No files were modified automatically because no safe automatic fixes were available.

**Scan Summary:**
- **Risk Grade**: ${params.grade}
- **Full Report**: [View report on Dashboard](${params.dashboardUrl}/repos/${params.repoId}/scans/${params.scanId})

---

## ⚠️ Findings Overview

Please review the following issues manually in your configurations:

${findingsTable}

---

*Generated by CI/CD Reliability Platform (Scan ID: \`${params.scanId}\`)*`;
}
