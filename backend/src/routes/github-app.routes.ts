import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/client';
import { githubAppInstallations, githubAppRepos, githubAppEvents } from '../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.middleware';
import { githubAppAuth } from '../github-app/app-auth';
import { createRateLimiter } from '../middleware/rate-limiter';
import { RATE_LIMITS } from '../middleware/rate-limit-configs';
import { processPushEvent } from '../github-app/event-processors/push.processor';
import { processPREvent } from '../github-app/event-processors/pr.processor';
import { processInstallationEvent } from '../github-app/event-processors/install.processor';

export const githubAppRouter = Router();

// POST /webhook (and /) - Webhook Receiver
const webhookHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const eventType = req.headers['x-github-event'] as string;
    const deliveryId = req.headers['x-github-delivery'] as string;

    if (!signature || !eventType || !deliveryId) {
      res.status(400).json({ error: 'Missing headers' });
      return;
    }

    const rawBody = req.body as Buffer;
    const valid = githubAppAuth.verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Idempotency check
    const existing = await db
      .select()
      .from(githubAppEvents)
      .where(eq(githubAppEvents.deliveryId, deliveryId))
      .limit(1);

    if (existing.length > 0) {
      res.status(200).json({ message: 'Already processed' });
      return;
    }

    const payload = JSON.parse(rawBody.toString());

    // Insert event record (status: received)
    await db.insert(githubAppEvents).values({
      deliveryId,
      eventType,
      action: payload.action || null,
      installationId: payload.installation?.id || null,
      repoFullName: payload.repository?.full_name || null,
      senderLogin: payload.sender?.login || null,
      status: 'received'
    });

    // Return 202 immediately
    res.status(202).json({ message: 'Webhook received' });

    // Process event asynchronously
    setImmediate(async () => {
      try {
        if (eventType === 'push') {
          await processPushEvent(payload, deliveryId);
        } else if (eventType === 'pull_request') {
          if (['opened', 'synchronize', 'reopened'].includes(payload.action)) {
            await processPREvent(payload, deliveryId);
          } else {
            await db.update(githubAppEvents)
              .set({ status: 'skipped', processedAt: new Date() })
              .where(eq(githubAppEvents.deliveryId, deliveryId));
          }
        } else if (eventType === 'installation' || eventType === 'installation_repositories') {
          await processInstallationEvent(payload);
          await db.update(githubAppEvents)
            .set({ status: 'completed', processedAt: new Date() })
            .where(eq(githubAppEvents.deliveryId, deliveryId));
        } else if (eventType === 'ping') {
          await db.update(githubAppEvents)
            .set({ status: 'completed', processedAt: new Date() })
            .where(eq(githubAppEvents.deliveryId, deliveryId));
        } else {
          await db.update(githubAppEvents)
            .set({ status: 'skipped', processedAt: new Date() })
            .where(eq(githubAppEvents.deliveryId, deliveryId));
        }
      } catch (err: any) {
        console.error('[Webhook] Processing error:', err);
        await db.update(githubAppEvents)
          .set({ status: 'failed', errorMessage: err.message, processedAt: new Date() })
          .where(eq(githubAppEvents.deliveryId, deliveryId));
      }
    });

  } catch (err) {
    next(err);
  }
};

githubAppRouter.post('/', createRateLimiter(RATE_LIMITS.githubAppWebhook), webhookHandler);
githubAppRouter.post('/webhook', createRateLimiter(RATE_LIMITS.githubAppWebhook), webhookHandler);

// GET /setup
githubAppRouter.get('/setup', (_req: Request, res: Response) => {
  res.json({
    installUrl: githubAppAuth.getAppInstallUrl(),
    appSlug: process.env.GITHUB_APP_SLUG || 'cicd-reliability',
    configured: githubAppAuth.isConfigured()
  });
});

// GET /installation
githubAppRouter.get('/installation', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.currentUser!;

    // Auto-link installations with matching github username that don't have a userId
    if (user.githubUsername) {
      await db
        .update(githubAppInstallations)
        .set({ userId: user.id })
        .where(
          and(
            eq(githubAppInstallations.accountLogin, user.githubUsername),
            isNull(githubAppInstallations.userId)
          )
        );
    }

    const installations = await db
      .select()
      .from(githubAppInstallations)
      .where(eq(githubAppInstallations.userId, user.id));

    const result = [];
    for (const inst of installations) {
      const reposList = await db
        .select()
        .from(githubAppRepos)
        .where(eq(githubAppRepos.installationId, inst.installationId));

      result.push({
        id: inst.installationId,
        account: inst.accountLogin,
        repoCount: reposList.length,
        repos: reposList
      });
    }

    res.json({
      installed: installations.length > 0,
      installations: result
    });

  } catch (err) {
    next(err);
  }
});

// PATCH /repos/:installationId/:githubRepoId
githubAppRouter.patch('/repos/:installationId/:githubRepoId', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.currentUser!;
    const installationId = parseInt(req.params.installationId, 10);
    const githubRepoId = parseInt(req.params.githubRepoId, 10);

    const [installation] = await db
      .select()
      .from(githubAppInstallations)
      .where(eq(githubAppInstallations.installationId, installationId))
      .limit(1);

    if (!installation || (installation.userId !== user.id && user.role !== 'admin')) {
      res.status(403).json({ error: 'Access denied to installation settings' });
      return;
    }

    const updates: any = {};
    if (req.body.autoScanEnabled !== undefined) {
      updates.autoScanEnabled = Boolean(req.body.autoScanEnabled);
    }
    if (req.body.autoPrEnabled !== undefined) {
      updates.autoPrEnabled = Boolean(req.body.autoPrEnabled);
    }
    if (req.body.blockOnGrade !== undefined) {
      updates.blockOnGrade = req.body.blockOnGrade;
    }
    updates.updatedAt = new Date();

    await db
      .update(githubAppRepos)
      .set(updates)
      .where(
        and(
          eq(githubAppRepos.installationId, installationId),
          eq(githubAppRepos.githubRepoId, githubRepoId)
        )
      );

    res.json({ success: true });

  } catch (err) {
    next(err);
  }
});

export default githubAppRouter;
