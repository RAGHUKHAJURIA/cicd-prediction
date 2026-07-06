import { db } from '../../db/client';
import { githubAppRepos, repos, scans, githubAppEvents } from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import crypto from 'crypto';
import { queueRedis } from '../../queue/redis.client';
import { githubAppAuth } from '../app-auth';
import { checkRunManager } from '../check-run';
import { enqueueScan } from '../../queue/producers';

export async function processPushEvent(
  payload: {
    ref: string;
    after: string;
    before: string;
    commits: Array<{
      id: string;
      modified: string[];
      added: string[];
      removed: string[];
    }>;
    repository: {
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      default_branch: string;
      owner: { login: string };
    };
    installation: { id: number };
    sender: { login: string };
  },
  deliveryId: string
): Promise<void> {
  const refName = payload.ref.replace('refs/heads/', '');

  // STEP 1 — Check if this push touches CI/CD files:
  const cicdPatterns = [
    '.github/workflows/',
    '.gitlab-ci.yml',
    'Dockerfile',
    'docker-compose',
    'Jenkinsfile',
    'k8s/',
    'kubernetes/',
    'helm/',
  ];
  
  const changedFiles = payload.commits.flatMap(c => [
    ...(c.modified || []),
    ...(c.added || [])
  ]);

  const hasCicdChanges = changedFiles.some(f =>
    cicdPatterns.some(p => f.includes(p) || f === p)
  );

  if (!hasCicdChanges) {
    console.log(`[PushProcessor] Push event skipped — no CI/CD files changed`);
    await db.update(githubAppEvents)
      .set({ status: 'skipped', processedAt: new Date() })
      .where(eq(githubAppEvents.deliveryId, deliveryId));
    return;
  }

  // STEP 2 — Ignore branch deletions:
  if (payload.after === '0000000000000000000000000000000000000000') {
    await db.update(githubAppEvents)
      .set({ status: 'skipped', processedAt: new Date() })
      .where(eq(githubAppEvents.deliveryId, deliveryId));
    return;
  }

  // STEP 3 — Check if repo is configured in github_app_repos:
  const [appRepo] = await db
    .select()
    .from(githubAppRepos)
    .where(
      and(
        eq(githubAppRepos.installationId, payload.installation.id),
        eq(githubAppRepos.githubRepoId, payload.repository.id)
      )
    )
    .limit(1);

  if (!appRepo || !appRepo.autoScanEnabled) {
    console.log(`[PushProcessor] Repo not found or autoScanEnabled is false`);
    await db.update(githubAppEvents)
      .set({ status: 'skipped', processedAt: new Date() })
      .where(eq(githubAppEvents.deliveryId, deliveryId));
    return;
  }

  // STEP 4 — Find or create platform repo record:
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
        repoUrl: `https://github.com/${payload.repository.full_name}`,
        name: payload.repository.full_name,
        provider: 'github',
        owner: payload.repository.owner.login,
        repoName: payload.repository.name,
        defaultBranch: payload.repository.default_branch,
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

  // STEP 5 — Cache installation token in Redis:
  const token = await githubAppAuth.getInstallationToken(payload.installation.id);
  // Store token under "temp-token:{repoId}" with 24hr TTL
  await queueRedis.set(`temp-token:${repoRecord.id}`, token, 'EX', 24 * 60 * 60);

  // STEP 6 — Create check run (in_progress) if this push is on a branch associated with any open PRs:
  let checkRunId: number | undefined;
  let openPrNumbers: number[] = [];

  try {
    const octokit = await githubAppAuth.getInstallationOctokit(payload.installation.id);
    const prList = await octokit.rest.pulls.list({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      state: 'open',
      head: `${payload.repository.owner.login}:${refName}`
    });

    if (prList.data.length > 0) {
      openPrNumbers = prList.data.map(p => p.number);
      checkRunId = await checkRunManager.create({
        installationId: payload.installation.id,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        headSha: payload.after
      });
    }
  } catch (err: any) {
    console.error(`[PushProcessor] Error checking open PRs or creating check run:`, err.message);
  }

  // STEP 7 — Trigger scan via service directly:
  const scanId = crypto.randomUUID();
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
    repoUrl: `https://github.com/${payload.repository.full_name}`,
    owner: payload.repository.owner.login,
    repoName: payload.repository.name,
    branch: refName,
    provider: 'github',
    ignorePaths: [],
    priority: 10,
    triggeredBy: 'webhook',
    webhookDeliveryId: deliveryId
  });

  // STEP 8 — Register the onScanComplete callback context in Redis:
  await queueRedis.set(
    `scan-app-context:${scanId}`,
    JSON.stringify({
      scanId,
      installationId: payload.installation.id,
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      checkRunId,
      prNumbers: openPrNumbers,
      appRepoConfig: appRepo
    }),
    'EX',
    24 * 60 * 60
  );

  // STEP 9 — Update github_app_events record:
  await db
    .update(githubAppEvents)
    .set({
      status: 'processing',
      scanId,
      checkRunId: checkRunId ?? null
    })
    .where(eq(githubAppEvents.deliveryId, deliveryId));
}
