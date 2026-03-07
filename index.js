/**
 * index.js
 * --------
 * Entry point for the Subscription Tracker backend.
 *
 * Responsibilities:
 *   1. Load environment variables from .env
 *   2. Initialize Firebase Admin (via firebase.js import side-effect)
 *   3. Register the cron job
 *   4. Start a minimal Express server with a /health endpoint so that
 *      hosting platforms (Render, Railway, Fly.io) know the service is alive.
 */

import 'dotenv/config';                         // must be the very first import
import express from 'express';
import { initCronJobs } from './services/cronService.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Simple liveness probe used by cloud hosting platforms to confirm the server
 * is running. Returns 200 with a JSON body.
 */
app.get('/health', (_req, res) => {
  res.status(200).json({
    status:    'ok',
    service:   'subscription-tracker-backend',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /trigger-check  (optional, dev/debug only)
 * Manually fires the daily cron logic without waiting for the schedule.
 * Remove or protect this route before shipping to production.
 */
if (process.env.NODE_ENV !== 'production') {
  // Lazy import so the route only exists during local development
  app.get('/trigger-check', async (_req, res) => {
    try {
      const { default: cron } = await import('node-cron');
      // We want to run the actual job logic – import it directly
      const { runDailyCheck } = await import('./services/cronService.js');

      // runDailyCheck is not exported by default, so we re-export it in dev.
      // If you want this route working, export runDailyCheck from cronService.js.
      // See comment in that file.
      res.json({ message: 'Trigger not wired – see comment in index.js.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ── Startup ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Subscription Tracker backend running on port ${PORT}`);

  // Register the cron job *after* the server is listening so that any startup
  // errors in Firebase / env-var validation surface before the job tries to run.
  initCronJobs();
});
