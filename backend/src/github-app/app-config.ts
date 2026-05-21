import { App } from '@octokit/app';
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
  private app: App;
  private cache: CacheClient;

  constructor(config: GitHubAppConfig) {
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
    this.cache = new CacheClient('github-app:');
  }

  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    const octokit = await this.app.getInstallationOctokit(installationId);
    return octokit as unknown as Octokit; // the types between @octokit/app and @octokit/rest are sometimes slightly mismatched, but they work
  }

  async getInstallationForRepo(owner: string, repo: string): Promise<{ installationId: number; octokit: Octokit } | null> {
    const cacheKey = `install:${owner}:${repo}`;
    let installationId = await this.cache.get<number>(cacheKey);

    if (!installationId) {
      try {
        const { data } = await this.app.octokit.request("GET /repos/{owner}/{repo}/installation", {
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

  generateJWT(): string {
    return this.app.getSignedJsonWebToken();
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
