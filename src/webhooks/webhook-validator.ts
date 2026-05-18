/**
 * @file webhook-validator.ts
 * @description HMAC-SHA256 webhook signature verification + replay prevention.
 *
 * Security requirements:
 *   - Uses crypto.timingSafeEqual (prevents timing attacks)
 *   - Never uses === for signature comparison
 *   - Rejects malformed X-Hub-Signature-256 headers
 *   - Redis-backed delivery ID deduplication with 1h TTL
 */

import crypto from 'crypto'
import { queueRedis } from '../queue/redis.client'

const DELIVERY_TTL_SECONDS = 3600 // 1 hour

// ── Signature Verification ──────────────────────────────────────────────────

/**
 * Verify a GitHub webhook payload signature using HMAC-SHA256.
 * Uses timingSafeEqual to prevent timing side-channel attacks.
 */
export function verifyGitHubSignature(
  rawBody: Buffer,
  signature: string,
  secret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false
  }

  const sigHex = signature.slice('sha256='.length)
  if (!/^[0-9a-f]+$/i.test(sigHex)) {
    return false
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  if (sigHex.length !== expected.length) {
    return false
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sigHex, 'hex'),
      Buffer.from(expected, 'hex')
    )
  } catch {
    return false
  }
}

// ── Header Validation ───────────────────────────────────────────────────────

export interface WebhookHeaders {
  event: string
  deliveryId: string
  signature: string
}

/**
 * Extract and validate required GitHub webhook headers.
 * Returns null if any required header is missing.
 */
export function validateWebhookHeaders(
  headers: Record<string, string | string[] | undefined>
): WebhookHeaders | null {
  const event = extractHeader(headers, 'x-github-event')
  const deliveryId = extractHeader(headers, 'x-github-delivery')
  const signature = extractHeader(headers, 'x-hub-signature-256')

  if (!event || !deliveryId || !signature) {
    return null
  }

  return { event, deliveryId, signature }
}

function extractHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const value = headers[name]
  if (typeof value === 'string' && value.length > 0) return value
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') return value[0]
  return null
}

// ── Replay Attack Prevention ────────────────────────────────────────────────

/**
 * Check if a webhook delivery has already been processed.
 * Uses Redis SET NX (set-if-not-exists) with TTL for atomic check+mark.
 *
 * Returns true if this is a duplicate delivery.
 * Returns false if this is a new delivery (and marks it as processed).
 *
 * On Redis failure, returns false (allow processing — err on the side of action).
 */
export async function isDuplicateDelivery(deliveryId: string): Promise<boolean> {
  const key = `webhook:delivery:${deliveryId}`

  try {
    // SET NX returns 'OK' only if key didn't exist (new delivery)
    const result = await queueRedis.set(key, '1', 'EX', DELIVERY_TTL_SECONDS, 'NX')
    return result !== 'OK' // null means key existed → duplicate
  } catch (err: any) {
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'webhook_dedup_redis_error',
      deliveryId,
      error: err.message,
      timestamp: new Date().toISOString()
    }))
    // On Redis failure, allow processing (cache is optimization only)
    return false
  }
}
