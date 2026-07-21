import express from 'express';
import cors from 'cors';
import { config, summarizeConfig } from './config.js';
import './db.js'; // initialize schema
import ordersRouter from './routes/orders.js';
import webhooksRouter from './routes/webhooks.js';
import adminRouter from './routes/admin.js';
import metaRouter from './routes/meta.js';
import { runDefaultReleaseSweep } from './services/orderService.js';

const app = express();
app.disable('x-powered-by');
app.use(cors());

// Capture the raw body so the Monnify webhook signature (HMAC over raw bytes) can be verified.
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded evidence (read-only) with light caching.
app.use('/uploads', express.static(config.paths.uploads, { maxAge: '1h', immutable: false }));

app.get('/', (_req, res) => res.json({ service: 'LinkLock API', status: 'ok', docs: '/api/status' }));

app.use('/api', metaRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/admin', adminRouter);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));

// Central error handler.
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err.message || 'Internal error' });
});

const server = app.listen(config.port, () => {
  console.log('\n  LinkLock API — escrow at the speed of a transfer');
  console.table(summarizeConfig());
  console.log(`  Listening on http://localhost:${config.port}\n`);
});

// Default-release sweep: release funds to the vendor when a delivery window expires with no dispute.
const SWEEP_MS = 10_000;
const sweep = setInterval(async () => {
  try {
    const released = await runDefaultReleaseSweep();
    if (released.length) console.log(`[sweep] default-released: ${released.join(', ')}`);
  } catch (err) {
    console.error('[sweep] error:', err.message);
  }
}, SWEEP_MS);
sweep.unref?.();

function shutdown() {
  clearInterval(sweep);
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
