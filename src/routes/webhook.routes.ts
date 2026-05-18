/**
 * @file webhook.routes.ts
 * @description Express routes for GitHub webhook receiver.
 *
 * CRITICAL: Uses express.raw() middleware — body must be a Buffer
 * for HMAC-SHA256 signature verification. JSON parsing happens AFTER
 * signature validation.
 *
 * This route NEVER waits for workers. It validates, deduplicates,
 * enqueues, and returns immediately.
 */

import { Router, Request, Response } from 'express'
import express from 'express'
import {
  verifyGitHubSignature,
  validateWebhookHeaders,
  isDuplicateDelivery
} from '../webhooks/webhook-validator'
import { webhookHandler } from '../webhooks/event-handler'
import type {
  GitHubPushEvent,
  GitHubPullRequestEvent,
  GitHubPingEvent
} from '../webhooks/github.webhook'

const router = Router()

const WEBHOOK_SECRET = process.env['GITHUB_WEBHOOK_SECRET'] ?? ''

// Use raw body parser — signature verification needs the exact bytes
router.use(express.raw({ type: '*/*', limit: '25mb' }))

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now()

  // Step 1: Validate headers
  const headers = validateWebhookHeaders(req.headers)
  if (!headers) {
    res.status(400).json({
      success: false,
      error: 'Missing required GitHub webhook headers'
    })
    return
  }

  // Step 2: Validate signature
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body))

  if (!WEBHOOK_SECRET) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'webhook_secret_missing',
      deliveryId: headers.deliveryId,
      timestamp: new Date().toISOString()
    }))
    res.status(500).json({ success: false, error: 'Webhook secret not configured' })
    return
  }

  if (!verifyGitHubSignature(rawBody, headers.signature, WEBHOOK_SECRET)) {
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'webhook_signature_invalid',
      deliveryId: headers.deliveryId,
      timestamp: new Date().toISOString()
    }))
    res.status(401).json({ success: false, error: 'Invalid signature' })
    return
  }

  // Step 3: Deduplicate delivery
  const duplicate = await isDuplicateDelivery(headers.deliveryId)
  if (duplicate) {
    console.log(JSON.stringify({
      level: 'info',
      event: 'webhook_duplicate',
      deliveryId: headers.deliveryId,
      timestamp: new Date().toISOString()
    }))
    res.status(200).json({ success: true, duplicate: true })
    return
  }

  // Step 4: Parse JSON body
  let payload: unknown
  try {
    payload = JSON.parse(rawBody.toString('utf-8'))
  } catch {
    res.status(400).json({ success: false, error: 'Invalid JSON payload' })
    return
  }

  // Step 5: Route by event type
  try {
    switch (headers.event) {
      case 'ping': {
        const result = webhookHandler.handlePingEvent(payload as GitHubPingEvent)
        res.status(200).json({ success: true, event: 'ping', data: result })
        return
      }

      case 'push': {
        const result = await webhookHandler.handlePushEvent(
          payload as GitHubPushEvent,
          headers.deliveryId
        )

        if (result.skipped) {
          res.status(200).json({
            success: true,
            event: 'push',
            skipped: true,
            reason: result.reason
          })
        } else {
          res.status(202).json({
            success: true,
            event: 'push',
            data: {
              scanId: result.scanId,
              jobId: result.jobId,
              changedFiles: result.changedFiles
            }
          })
        }
        return
      }

      case 'pull_request': {
        const result = await webhookHandler.handlePullRequestEvent(
          payload as GitHubPullRequestEvent,
          headers.deliveryId
        )

        if (result.skipped) {
          res.status(200).json({
            success: true,
            event: 'pull_request',
            skipped: true,
            reason: result.reason
          })
        } else {
          res.status(202).json({
            success: true,
            event: 'pull_request',
            data: {
              scanId: result.scanId,
              jobId: result.jobId
            }
          })
        }
        return
      }

      default: {
        res.status(200).json({
          success: true,
          event: headers.event,
          message: `Event '${headers.event}' acknowledged but not processed`
        })
        return
      }
    }
  } catch (err: any) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'webhook_handler_error',
      deliveryId: headers.deliveryId,
      eventType: headers.event,
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    }))
    res.status(500).json({ success: false, error: 'Internal webhook processing error' })
  } finally {
    const durationMs = Date.now() - startTime
    console.log(JSON.stringify({
      level: 'info',
      event: 'webhook_processed',
      deliveryId: headers.deliveryId,
      eventType: headers.event,
      durationMs,
      timestamp: new Date().toISOString()
    }))
  }
})

export default router
