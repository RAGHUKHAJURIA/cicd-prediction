/**
 * @file bull-board.ts
 * @description Bull Board dashboard integration for queue visibility.
 *
 * Exposes a web UI at /admin/queues with basic auth protection.
 * Allows inspecting, retrying, and cleaning jobs across all queues.
 */

import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { scanQueue, analysisQueue, aiQueue } from './queue.definitions'
import type { Request, Response, NextFunction, Application } from 'express'

// ── Bull Board Setup ────────────────────────────────────────────────────────

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')

createBullBoard({
  queues: [
    new BullMQAdapter(scanQueue),
    new BullMQAdapter(analysisQueue),
    new BullMQAdapter(aiQueue)
  ],
  serverAdapter
})

// ── Basic Auth Middleware ───────────────────────────────────────────────────

function basicAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const username = process.env['BULL_BOARD_USERNAME'] ?? 'admin'
  const password = process.env['BULL_BOARD_PASSWORD']

  if (!password) {
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'bull_board_no_password',
      message: 'BULL_BOARD_PASSWORD not set — dashboard is unprotected in production',
      timestamp: new Date().toISOString()
    }))
  }

  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    if (password) {
      res.set('WWW-Authenticate', 'Basic realm="Bull Board"')
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    next()
    return
  }

  const encoded = authHeader.slice('Basic '.length)
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
  const [user, pass] = decoded.split(':')

  if (user === username && pass === password) {
    next()
  } else {
    res.set('WWW-Authenticate', 'Basic realm="Bull Board"')
    res.status(401).json({ error: 'Invalid credentials' })
  }
}

// ── Mount Function ──────────────────────────────────────────────────────────

/**
 * Mount Bull Board dashboard on an Express app.
 * Protected by basic auth when BULL_BOARD_PASSWORD is set.
 */
export function mountBullBoard(app: Application): void {
  app.use('/admin/queues', basicAuthMiddleware, serverAdapter.getRouter())

  console.log(JSON.stringify({
    level: 'info',
    event: 'bull_board_mounted',
    path: '/admin/queues',
    timestamp: new Date().toISOString()
  }))
}

export { serverAdapter }
