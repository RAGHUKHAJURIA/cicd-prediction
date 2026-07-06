import { db } from '../../db/client';
import { githubAppRepos, repos, scans, githubAppEvents } from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import crypto from 'crypto';
import { queueRedis } from '../../queue/redis.client';
import { githubAppAuth } from '../app-auth';
import { checkRunManager } from '../check-run';
import { enqueueScan } from '../../queue/producers';

export async function processPREvent(
  payload: {
    action: string;
    number: number;
    pull_request: {
      head: { sha: string; ref: string };
      base: { ref: string };
      title: string;
      user: { login: string };
    };
    repository: {
      id: number;
      name: string;
      full_name: string;
      owner: { login: string };
    };
    installation: { id: number };
  },
  deliveryId: string
): Promise<void> {
  const { action, number: prNumber, pull_request, repository, installation } = payload;

  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    console.log(`[PRProcessor] Pull request event skipped — action "${action}" ignored`);
    await db.update(githubAppEvents)
      .set({ status: 'skipped', processedAt: new Date() })
      .where(eq(githubAppEvents.deliveryId, deliveryId));
    return;
  }

  // STEP 1 — Setup (same as push processor):
  const [appRepo] = await db
    .select()
    .from(githubAppRepos)
    .where(
      and(
        eq(githubAppRepos.installationId, installation.id),
        eq(githubAppRepos.githubRepoId, repository.id)
      )
    )
    .limit(1);

  if (!appRepo || !appRepo.autoScanEnabled) {
    console.log(`[PRProcessor] Repo not found or autoScanEnabled is false`);
    await db.update(githubAppEvents)
      .set({ status: 'skipped', processedAt: new Date() })
      .where(eq(githubAppEvents.deliveryId, deliveryId));
    return;
  }

  let repoRecord: typeof repos.$inferSelect | null = null;
  if (appRepo.repoId) {
    const [existingRepo] = await db.select().from(repos).where(eq(repos.id, appRepo.repoId)).limit(1);
    repoRecord = existingRepo || null;
  }

  if (!repoRecord) {
    const newRepoId = crypto.randomUUID();
    const [inserted] = await db
      .insert(repos)
      .values({
        id: newRepoId,
        repoUrl: `https://github.com/${repository.full_name}`,
        name: repository.full_name,
        provider: 'github',
        owner: repository.owner.login,
        repoName: repository.name,
        defaultBranch: (repository as any).default_branch || 'main',
        status: 'active',
        totalScans: 0,
        settings: { autoScanOnPush: true }
      })
      .returning();

    repoRecord = inserted;

    await db
      .update(githubAppRepos)
      .set({ repoId: newRepoId })
      .where(eq(githubAppRepos.id, appRepo.id));
  }

  // Cache installation token in Redis:
  const token = await githubAppAuth.getInstallationToken(installation.id);
  await queueRedis.set(`temp-token:${repoRecord.id}`, token, 'EX', 24 * 60 * 60);

  // STEP 2 — Create check run:
  let checkRunId: number | undefined;
  try {
    checkRunId = await checkRunManager.create({
      installationId: installation.id,
      owner: repository.owner.login,
      repo: repository.name,
      headSha: pull_request.head.sha
    });
  } catch (err: any) {
    console.error(`[PRProcessor] Failed to create check run:`, err.message);
  }

  // STEP 3 — Trigger scan:
  const scanId = crypto.randomUUID();
  const refName = pull_request.head.ref;

  await db.insert(scans).values({
    id: scanId,
    repoId: repoRecord.id,
    status: 'running',
    branch: refName,
    triggeredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    totalFiles: 0,
    totalFindings: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0
  });

  await enqueueScan({
    scanId,
    repoId: repoRecord.id,
    repoUrl: `https://github.com/${repository.full_name}`,
    owner: repository.owner.login,
    repoName: repository.name,
    branch: refName,
    provider: 'github',
    ignorePaths: [],
    priority: 5, // High priority for PRs
    triggeredBy: 'webhook',
    webhookDeliveryId: deliveryId
  });

  // STEP 4 — Store scan context in Redis with prNumber and headSha:
  await queueRedis.set(
    `scan-app-context:${scanId}`,
    JSON.stringify({
      scanId,
      installationId: installation.id,
      owner: repository.owner.login,
      repo: repository.name,
      checkRunId,
      prNumber,
      headSha: pull_request.head.sha,
      appRepoConfig: appRepo
    }),
    'EX',
    24 * 60 * 60
  );

  // Update github_app_events record:
  await db
    .update(githubAppEvents)
    .set({
      status: 'processing',
      scanId,
      checkRunId: checkRunId ?? null,
      prNumber
    })
    .where(eq(githubAppEvents.deliveryId, deliveryId));
}
