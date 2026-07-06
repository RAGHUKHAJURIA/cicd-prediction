import { Octokit } from '@octokit/rest';
import crypto from 'crypto';
import { AppError } from '../middleware/error-handler';

class GitHubAppAuth {
  private app: any = null;
  private appPromise: Promise<any> | null = null;
  private tokenCache: Map<number, {
    token: string;
    expiresAt: Date;
  }> = new Map();

  constructor() {
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const appId = process.env.GITHUB_APP_ID;

    if (!privateKey || !appId) {
      console.warn(
        '[GitHubAppAuth] GitHub App not configured — ' +
        'GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY env vars missing.'
      );
      return;
    }

    try {
      const decodedKey = Buffer.from(privateKey, 'base64').toString('utf8');
      
      // Lazy-load @octokit/app (ESM-only) via dynamic import()
      this.appPromise = import('@octokit/app').then(({ App }) => {
        this.app = new App({
          appId: parseInt(appId, 10),
          privateKey: decodedKey,
          webhooks: {
            secret: process.env.GITHUB_APP_WEBHOOK_SECRET ?? ''
          },
        });
        return this.app;
      }).catch((err) => {
        console.error('[GitHubAppAuth] Failed to initialize App instance:', err.message);
        return null;
      });
    } catch (err: any) {
      console.error('[GitHubAppAuth] Failed to decode private key:', err.message);
    }
  }

  isConfigured(): boolean {
    return !!this.appPromise;
  }

  private async getApp(): Promise<any> {
    if (this.app) return this.app;
    if (this.appPromise) return this.appPromise;
    return null;
  }

  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    const app = await this.getApp();
    if (!app) {
      throw new AppError(500, 'GitHub App is not configured', 'GITHUB_APP_NOT_CONFIGURED');
    }

    const cached = this.tokenCache.get(installationId);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (cached && cached.expiresAt > fiveMinutesFromNow) {
      return new Octokit({ auth: cached.token });
    }

    try {
      const response = await app.octokit.request('POST /app/installations/{installation_id}/access_tokens', {
        installation_id: installationId
      });
      const token = response.data.token;
      const expiresAt = new Date(response.data.expires_at);

      this.tokenCache.set(installationId, { token, expiresAt });
      return new Octokit({ auth: token });
    } catch (err: any) {
      console.error(`[GitHubAppAuth] Error acquiring installation token for ${installationId}:`, err.message);
      throw new AppError(401, `Cannot get token for installation ${installationId}`, 'GITHUB_APP_AUTH_FAILED');
    }
  }

  async getInstallationToken(installationId: number): Promise<string> {
    const app = await this.getApp();
    if (!app) {
      throw new AppError(500, 'GitHub App is not configured', 'GITHUB_APP_NOT_CONFIGURED');
    }

    const cached = this.tokenCache.get(installationId);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (cached && cached.expiresAt > fiveMinutesFromNow) {
      return cached.token;
    }

    try {
      const response = await app.octokit.request('POST /app/installations/{installation_id}/access_tokens', {
        installation_id: installationId
      });
      const token = response.data.token;
      const expiresAt = new Date(response.data.expires_at);

      this.tokenCache.set(installationId, { token, expiresAt });
      return token;
    } catch (err: any) {
      console.error(`[GitHubAppAuth] Error acquiring installation token for ${installationId}:`, err.message);
      throw new AppError(401, `Cannot get token for installation ${installationId}`, 'GITHUB_APP_AUTH_FAILED');
    }
  }

  async getAppOctokit(): Promise<Octokit> {
    const app = await this.getApp();
    if (!app) {
      throw new AppError(500, 'GitHub App is not configured', 'GITHUB_APP_NOT_CONFIGURED');
    }
    return app.octokit as unknown as Octokit;
  }

  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('[GitHubAppAuth] GITHUB_APP_WEBHOOK_SECRET is not configured.');
      return false;
    }
    if (!signature) {
      return false;
    }

    const sig = signature.startsWith('sha256=') ? signature : `sha256=${signature}`;
    const hmac = crypto.createHmac('sha256', webhookSecret);
    const expected = 'sha256=' + hmac.update(payload).digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expected)
      );
    } catch {
      return false;
    }
  }

  getAppInstallUrl(): string {
    const slug = process.env.GITHUB_APP_SLUG ?? 'cicd-reliability';
    return `https://github.com/apps/${slug}/installations/new`;
  }
}

export const githubAppAuth = new GitHubAppAuth();
export default githubAppAuth;
