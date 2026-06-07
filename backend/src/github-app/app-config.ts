// @ts-nocheck
import { Octokit } from '@octokit/rest';
import crypto from 'crypto';
import { CacheClient } from '../cache/cache.client';

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
}

export class GitHubAppAuth {
  private app: any;
  private appPromise: Promise<any> | null;
  private cache: CacheClient;
  private configured: boolean;

  constructor(config: GitHubAppConfig) {
    this.configured = Boolean(config.appId && config.privateKey);
    this.cache = new CacheClient('github-app:');

    if (this.configured) {
      // Lazy-load @octokit/app (ESM-only) via dynamic import()
      this.appPromise = import('@octokit/app').then(({ App }) => {
        this.app = new App({
          appId: config.appId,
          privateKey: config.privateKey,
          webhooks: {
            secret: config.webhookSecret,
          },
          oauth: {
            clientId: config.clientId,
            clientSecret: config.clientSecret,
          },
        });
        return this.app;
      }).catch((err) => {
        console.warn('[GitHubAppAuth] Failed to initialize @octokit/app:', err.message);
        this.configured = false;
        return null;
      });
    } else {
      this.appPromise = null;
      console.warn('[GitHubAppAuth] GitHub App not configured — GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY env vars missing.');
    }
  }

  private async getApp(): Promise<any> {
    if (!this.configured) return null;
    if (this.app) return this.app;
    return this.appPromise;
  }

  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    const app = await this.getApp();
    const octokit = await app.getInstallationOctokit(installationId);
    return octokit as unknown as Octokit; // the types between @octokit/app and @octokit/rest are sometimes slightly mismatched, but they work
  }

  async getInstallationForRepo(owner: string, repo: string): Promise<{ installationId: number; octokit: Octokit } | null> {
    const cacheKey = `install:${owner}:${repo}`;
    let installationId = await this.cache.get<number>(cacheKey);

    if (!installationId) {
      try {
        const app = await this.getApp();
        const { data } = await app.octokit.request("GET /repos/{owner}/{repo}/installation", {
          owner,
          repo,
        });
        installationId = data.id;
        // Cache for 24 hours
        await this.cache.set(cacheKey, installationId, 24 * 60 * 60);
      } catch (e) {
        return null;
      }
    }

    if (!installationId) return null;

    const octokit = await this.getInstallationOctokit(installationId);
    return { installationId, octokit };
  }

  async generateJWT(): Promise<string> {
    const app = await this.getApp();
    return app.getSignedJsonWebToken();
  }

  async verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) return false;
    
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    } catch {
      return false;
    }
  }
}
