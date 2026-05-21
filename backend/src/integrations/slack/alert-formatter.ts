import { ScanDetail, RepoSummary } from '../../types/shared.types';
import { SlackMessage } from './slack-client';

export function formatCriticalAlert(
  scan: ScanDetail,
  repo: RepoSummary,
  dashboardUrl: string
): SlackMessage {
  const topFindings = scan.findings.critical.slice(0, 5).map(f => `• \`${f.ruleId}\` — ${f.title} (${f.filePath})`).join('\n');
  const color = '#f85149';

  return {
    attachments: [
      {
        color,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `⛔ Critical findings in ${repo.repoName}`
            }
          },
          {
            type: 'context',
            elements: [
              { type: 'plain_text', text: `Branch: ${scan.branch} | Scan triggered at: ${new Date(scan.triggeredAt).toLocaleString()} | Grade: ${scan.riskGrade}` }
            ]
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*🔴 Critical:* ${scan.criticalCount}` },
              { type: 'mrkdwn', text: `*🟠 High:* ${scan.highCount}` },
              { type: 'mrkdwn', text: `*🟡 Medium:* ${scan.mediumCount}` },
              { type: 'mrkdwn', text: `*🔵 Low:* ${scan.lowCount}` }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: topFindings || 'No critical findings.'
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'View Full Report' },
                style: 'primary',
                url: `${dashboardUrl}/repos/${repo.id}/scans/${scan.id}`
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Trigger Re-scan' },
                url: `${dashboardUrl}/repos/${repo.id}`
              }
            ]
          },
          { type: 'divider' }
        ]
      }
    ]
  };
}

export function formatGradeChangeAlert(
  repo: RepoSummary,
  previousGrade: string,
  newGrade: string,
  scan: ScanDetail,
  dashboardUrl: string
): SlackMessage {
  const gradeValues: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
  const degraded = gradeValues[newGrade] < gradeValues[previousGrade];

  return {
    attachments: [
      {
        color: degraded ? '#db6d28' : '#3fb950',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${degraded ? '⚠️ Risk Grade Degraded' : '✅ Risk Grade Improved'} in ${repo.repoName}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Risk grade went from *${previousGrade}* to *${newGrade}* on branch \`${scan.branch}\`.`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'View Scan Details' },
                url: `${dashboardUrl}/repos/${repo.id}/scans/${scan.id}`
              }
            ]
          }
        ]
      }
    ]
  };
}
