/**
 * @file event-handler.ts
 * @description Converts GitHub webhook events into BullMQ queue jobs.
 *
 * This file is orchestration only.
 * It NEVER runs scans inline.
 * It ONLY validates, resolves DB state, and enqueues.
 */

import { randomUUID } from 'crypto'
import { db } from '../db/client'
import { repos, scans } from '../db/schema'
import { eq } from 'drizzle-orm'
import { enqueueScan } from '../queue/producers'
import { JobPriority } from '../queue/job.types'
import type { FetchAndParseJobPayload } from '../queue/job.types'
import {
  extractBranchFromRef,
  detectCIFileChanges,
  isActionableprAction
} from './github.webhook'
import type {
  GitHubPushEvent,
  GitHubPullRequestEvent,
  GitHubPingEvent
} from './github.webhook'

// ── Result Types ────────────────────────────────────────────────────────────

export interface WebhookHandlerResult {
  accepted: boolean
  skipped: boolean
  reason?: string
  scanId?: string
  jobId?: string
  changedFiles?: string[]
  prComment?: string
}

// ── GitHubWebhookHandler ────────────────────────────────────────────────────

export class GitHubWebhookHandler {
  /**
   * Handle a push event.
   * 1. Detect CI/CD file changes
   * 2. Look up repo in DB
   * 3. Create scan record
   * 4. Enqueue scan with CRITICAL priority
   */
  async handlePushEvent(event: GitHubPushEvent, deliveryId: string): Promise<WebhookHandlerResult> {
    const branch = extractBranchFromRef(event.ref)

    // Skip tag pushes and branch deletions
    if (event.ref.startsWith('refs/tags/') || event.deleted) {
      return this.skipped('tag_or_deletion')
    }

    // Step 1: Detect CI/CD file changes
    const ciChanges = detectCIFileChanges(event.commits)
    if (!ciChanges.changed) {
      this.log('push_no_ci_changes', {
        repo: event.repository.full_name,
        branch,
        deliveryId,
        commitCount: event.commits.length
      })
      return this.skipped('no_ci_changes')
    }

    // Step 2: Lookup repo in DB
    const repoUrl = event.repository.html_url
    const repo = await this.findRepo(repoUrl)
    if (!repo) {
      this.log('push_repo_not_registered', {
        repo: event.repository.full_name,
        repoUrl,
        deliveryId
      })
      return this.skipped('repo_not_registered')
    }

    // Step 3: Create scan record
    const scanId = randomUUID()
    await db.insert(scans).values({
      id: scanId,
      repoId: repo.id,
      branch,
      status: 'queued'
    } as any)

    // Step 4: Enqueue scan
    const payload: FetchAndParseJobPayload = {
      scanId,
      repoId: repo.id,
      repoUrl: event.repository.clone_url,
      owner: event.repository.owner.login,
      repoName: event.repository.name,
      branch,
      provider: 'github',
      ignorePaths: [],
      priority: JobPriority.CRITICAL,
      triggeredBy: 'webhook',
      webhookDeliveryId: deliveryId
    }

    const enqueued = await enqueueScan(payload)

    this.log('push_scan_enqueued', {
      repo: event.repository.full_name,
      branch,
      scanId,
      jobId: enqueued.jobId,
      changedFiles: ciChanges.files,
      deliveryId
    })

    return {
      accepted: true,
      skipped: false,
      scanId,
      jobId: enqueued.jobId,
      changedFiles: ciChanges.files
    }
  }

  /**
   * Handle a pull_request event.
   * Only processes: opened, synchronize, reopened.
   * Ignores: closed, labeled, assigned, etc.
   */
  async handlePullRequestEvent(
    event: GitHubPullRequestEvent,
    deliveryId: string
  ): Promise<WebhookHandlerResult> {
    if (!isActionableprAction(event.action)) {
      return this.skipped(`pr_action_ignored:${event.action}`)
    }

    // Look up repo
    const repoUrl = event.repository.html_url
    const repo = await this.findRepo(repoUrl)
    if (!repo) {
      return this.skipped('repo_not_registered')
    }

    const branch = event.pull_request.head.ref
    const scanId = randomUUID()

    await db.insert(scans).values({
      id: scanId,
      repoId: repo.id,
      branch,
      status: 'queued'
    } as any)

    const payload: FetchAndParseJobPayload = {
      scanId,
      repoId: repo.id,
      repoUrl: event.repository.clone_url,
      owner: event.repository.owner.login,
      repoName: event.repository.name,
      branch,
      provider: 'github',
      ignorePaths: [],
      priority: JobPriority.CRITICAL,
      triggeredBy: 'pr',
      webhookDeliveryId: deliveryId
    }

    const enqueued = await enqueueScan(payload)

    this.log('pr_scan_enqueued', {
      repo: event.repository.full_name,
      prNumber: event.number,
      action: event.action,
      branch,
      scanId,
      jobId: enqueued.jobId,
      deliveryId
    })

    return {
      accepted: true,
      skipped: false,
      scanId,
      jobId: enqueued.jobId,
      prComment: buildPRComment(event)
    }
  }

  /**
   * Handle a ping event (webhook verification).
   */
  handlePingEvent(event: GitHubPingEvent): { success: true; zen: string } {
    this.log('ping_received', {
      hookId: event.hook_id,
      repo: event.repository?.full_name,
      events: event.hook?.events
    })
    return { success: true, zen: event.zen }
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private async findRepo(repoUrl: string): Promise<{ id: string; owner: string; repoName: string } | null> {
    const rows = await db.select({
      id: repos.id,
      owner: repos.owner,
      repoName: repos.repoName
    }).from(repos).where(eq(repos.repoUrl, repoUrl)).limit(1)

    return rows[0] ?? null
  }

  private skipped(reason: string): WebhookHandlerResult {
    return { accepted: false, skipped: true, reason }
  }

  private log(event: string, data: Record<string, unknown>): void {
    console.log(JSON.stringify({
      level: 'info',
      event: `webhook_${event}`,
      ...data,
      timestamp: new Date().toISOString()
    }))
  }
}

// ── PR Comment Builder ──────────────────────────────────────────────────────

/**
 * Build a markdown PR comment summarizing that a CI/CD scan was triggered.
 */
export function buildPRComment(event: GitHubPullRequestEvent): string {
  return `## 🔍 CI/CD Reliability Scan Triggered

| Detail | Value |
|--------|-------|
| **PR** | #${event.number} |
| **Branch** | \`${event.pull_request.head.ref}\` |
| **Action** | ${event.action} |
| **Triggered by** | @${event.sender.login} |

A CI/CD reliability scan has been automatically triggered for this pull request.
Results will be posted here once the analysis is complete.

---
*Powered by CI/CD Reliability Intelligence Platform*`
}

// ── Singleton Export ────────────────────────────────────────────────────────

export const webhookHandler = new GitHubWebhookHandler()
