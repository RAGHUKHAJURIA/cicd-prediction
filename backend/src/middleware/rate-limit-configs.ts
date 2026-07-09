import { Request } from 'express'

export interface RateLimitConfig {
  windowMs: number    // window size in milliseconds
  limit: number       // max requests per window
  prefix: string      // Redis key prefix (keep short)
  message: string     // error message shown to user
  skipSuccessfulRequests?: boolean // only count failed requests (useful for auth endpoints)
  skipFailedRequests?: boolean     // don't penalize for server errors
  keyGenerator?: (req: Request) => string // custom key generator (default: IP address)
}

export const RATE_LIMITS = {
  // PUBLIC SCAN (web app paste-URL flow)
  // Generous for logged-in users, strict for guests
  publicScan: {
    guest: {
      windowMs: 60 * 60 * 1000,   // 1 hour
      limit: 5,
      prefix: 'scan:guest',
      message: 'Guest scan limit: 5 scans per hour. Sign in with GitHub for 30 scans per hour.',
    },
    authenticated: {
      windowMs: 60 * 60 * 1000,
      limit: 30,
      prefix: 'scan:auth',
      message: 'Scan limit: 30 scans per hour.',
    },
    premium: {
      windowMs: 60 * 60 * 1000,
      limit: 200,
      prefix: 'scan:premium',
      message: 'Premium scan limit: 200 scans per hour.',
    },
  },

  // AUTH ENDPOINTS
  // Strict to prevent brute force password attacks
  authLogin: {
    windowMs: 15 * 60 * 1000,     // 15 minutes
    limit: 5,
    prefix: 'auth:login',
    message: 'Too many login attempts. Try again in 15 minutes.',
    skipSuccessfulRequests: true, // only failed logins count toward the limit
    keyGenerator: (req: Request): string => {
      // Key on IP + email combination for login
      const email = req.body?.email ?? 'unknown'
      return `${req.ip}:${email.toLowerCase()}`
    },
  },
  authRegister: {
    windowMs: 60 * 60 * 1000,
    limit: 3,
    prefix: 'auth:register',
    message: 'Too many registration attempts. Try again in 1 hour.',
  },
  authPasswordChange: {
    windowMs: 60 * 60 * 1000,
    limit: 5,
    prefix: 'auth:pwchange',
    message: 'Too many password change attempts. Try again in 1 hour.',
    skipSuccessfulRequests: true,
  },

  // REPO MANAGEMENT
  repoCreate: {
    windowMs: 60 * 60 * 1000,
    limit: 20,
    prefix: 'repo:create',
    message: 'Repo registration limit: 20 per hour.',
  },
  repoList: {
    windowMs: 60 * 1000,           // 1 minute
    limit: 60,
    prefix: 'repo:list',
    message: 'Too many repo list requests. Slow down.',
  },

  // SCAN TRIGGERS
  scanTrigger: {
    windowMs: 60 * 60 * 1000,
    limit: 30,
    prefix: 'scan:trigger',
    message: 'Scan limit: 30 per hour. Scans are expensive — results are cached so re-querying is instant.',
  },
  scanTriggerStrict: {
    // For the same repo, don't allow spamming
    windowMs: 5 * 60 * 1000,       // 5 minutes
    limit: 3,
    prefix: 'scan:repo',
    message: 'This repo was scanned recently. Wait 5 minutes before re-scanning.',
    keyGenerator: (req: Request): string => req.params.id ?? req.ip ?? 'unknown',
  },

  // AI ENDPOINTS (most expensive — Claude API costs money)
  aiExplain: {
    windowMs: 60 * 60 * 1000,
    limit: 20,
    prefix: 'ai:explain',
    message: 'AI explanation limit: 20 per hour. Results are cached — refresh the page to see cached results.',
  },
  aiRemediate: {
    windowMs: 60 * 60 * 1000,
    limit: 10,
    prefix: 'ai:remediate',
    message: 'AI remediation limit: 10 per hour.',
  },
  aiReport: {
    windowMs: 60 * 60 * 1000,
    limit: 10,
    prefix: 'ai:report',
    message: 'AI report limit: 10 per hour.',
  },

  // GITHUB API PROXY ROUTES
  githubRepoList: {
    windowMs: 60 * 1000,
    limit: 10,
    prefix: 'gh:repos',
    message: 'GitHub repo list: max 10 requests per minute.',
  },
  githubPushPatch: {
    windowMs: 60 * 60 * 1000,
    limit: 20,
    prefix: 'gh:push',
    message: 'Patch push limit: 20 per hour.',
  },
  githubCreatePR: {
    windowMs: 60 * 60 * 1000,
    limit: 10,
    prefix: 'gh:pr',
    message: 'PR creation limit: 10 per hour.',
  },

  // GITHUB APP WEBHOOKS
  githubAppWebhook: {
    windowMs: 60 * 1000,
    limit: 300,           // 5 per second sustained
    prefix: 'webhook:app',
    message: 'Webhook rate limit exceeded.',
    keyGenerator: (_req: Request): string => 'global',
  },

  // GENERAL API
  generalApi: {
    windowMs: 60 * 1000,
    limit: 100,
    prefix: 'api:general',
    message: 'Too many requests. Slow down.',
  },

  // QUEUE STATS (dashboard polling)
  queueStats: {
    windowMs: 60 * 1000,
    limit: 120,           // 2 per second (dashboard polls every 2s)
    prefix: 'api:queue',
    message: 'Queue stats: max 120 requests per minute.',
  },

  // JOB STATUS POLLING
  jobStatus: {
    windowMs: 60 * 1000,
    limit: 120,           // same as queue stats
    prefix: 'api:job',
    message: 'Job status polling: max 120 requests per minute.',
  },
}
