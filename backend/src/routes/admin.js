import { Router } from 'express';
import path from 'node:path';
import { db } from '../db.js';
import { config } from '../config.js';
import * as svc from '../services/orderService.js';
import * as ai from '../lib/ai.js';

const router = Router();

// Simple bearer-token guard for the internal review console.
router.use((req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.query.token;
  if (token !== config.adminToken) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* All orders (newest first) for the ops board, with an optional ?state= filter. */
router.get('/orders', ah(async (req, res) => {
  const rows = req.query.state
    ? db.prepare('SELECT * FROM orders WHERE state = ? ORDER BY created_at DESC').all(req.query.state)
    : db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json(rows.map((o) => svc.serializeOrder(o, { includePrivate: true })));
}));

/* The review queue: everything currently frozen or under review. */
router.get('/review-queue', ah(async (req, res) => {
  const rows = db.prepare("SELECT * FROM orders WHERE state IN ('DISPUTED','UNDER_REVIEW') ORDER BY updated_at DESC").all();
  res.json(rows.map((o) => svc.serializeOrder(o, { includePrivate: true })));
}));

/* Re-run the AI evidence comparison for a case (assist for the reviewer). */
router.post('/orders/:ref/recompare', ah(async (req, res) => {
  const order = svc.getOrderByRef(req.params.ref);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const vendorEv = db.prepare("SELECT * FROM evidence WHERE order_id=? AND side='VENDOR' ORDER BY captured_at DESC LIMIT 1").get(order.id);
  const buyerEv = db.prepare("SELECT * FROM evidence WHERE order_id=? AND side='BUYER' ORDER BY captured_at DESC LIMIT 1").get(order.id);
  if (!vendorEv || !buyerEv) return res.status(400).json({ error: 'Need both vendor and buyer evidence to compare' });
  const comparison = await ai.compareEvidence({
    dispatchFilePath: path.join(config.paths.uploads, vendorEv.stored_file),
    problemFilePath: path.join(config.paths.uploads, buyerEv.stored_file),
    itemDescription: order.item_description,
  });
  svc.saveDisputeAiComparison(order.id, comparison);
  res.json({ comparison, order: svc.serializeOrder(order, { includePrivate: true }) });
}));

/* Human decision: RELEASE | REVERSE | SPLIT on a frozen case. */
router.post('/orders/:ref/resolve', ah(async (req, res) => {
  const order = svc.getOrderByRef(req.params.ref);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const decision = String(req.body?.decision || '').toUpperCase();
  const note = req.body?.note;
  const resolved = await svc.resolveByHuman(order, { decision, note });
  res.json(svc.serializeOrder(resolved, { includePrivate: true }));
}));

export default router;
