import { Router } from 'express';
import path from 'node:path';
import { config } from '../config.js';
import { upload } from '../lib/upload.js';
import * as svc from '../services/orderService.js';
import * as ai from '../lib/ai.js';
import { STATES } from '../stateMachine.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function loadOrder(req, res, next) {
  const order = svc.getOrderByRef(req.params.ref);
  if (!order) return res.status(404).json({ error: 'Order not found', ref: req.params.ref });
  req.order = order;
  next();
}

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

/* Create an order → mints the isolated per-order account, returns the shareable link. */
router.post('/', ah(async (req, res) => {
  const { itemDescription, amount, buyerContact, vendorName, vendorBankCode, vendorAccountNumber, vendorAccountName } = req.body || {};
  if (!itemDescription || String(itemDescription).trim().length < 2) return bad(res, 'itemDescription is required');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return bad(res, 'amount must be a positive number');
  if (!vendorBankCode) return bad(res, 'vendorBankCode is required (where the vendor gets paid)');
  if (!vendorAccountNumber || !/^\d{10}$/.test(String(vendorAccountNumber))) return bad(res, 'vendorAccountNumber must be a 10-digit account number');

  const order = await svc.createOrder({
    itemDescription: String(itemDescription).trim(),
    amount: amt,
    buyerContact: buyerContact?.trim(),
    vendorName: vendorName?.trim(),
    vendorBankCode: String(vendorBankCode).trim(),
    vendorAccountNumber: String(vendorAccountNumber).trim(),
    vendorAccountName: vendorAccountName?.trim(),
  });
  res.status(201).json(svc.serializeOrder(order));
}));

/* Public order view (buyer/vendor share this). */
router.get('/:ref', loadOrder, ah(async (req, res) => {
  res.json(svc.serializeOrder(req.order));
}));

/* DEMO: simulate the buyer's bank transfer landing (stands in for the Monnify webhook). */
router.post('/:ref/simulate-payment', loadOrder, ah(async (req, res) => {
  if (!config.demoMode) return bad(res, 'Simulation is disabled (DEMO_MODE=false)', 403);
  if (req.order.state !== STATES.CREATED) return bad(res, `Order is already ${req.order.state}`, 409);
  const { order } = await svc.simulateInboundPayment(req.order);
  res.json(svc.serializeOrder(order));
}));

/* Vendor: ship & prove. Uploads dispatch proof; AI gates genuineness before SHIPPED. */
router.post('/:ref/ship', loadOrder, upload.single('proof'), ah(async (req, res) => {
  const order = req.order;
  if (order.state !== STATES.LOCKED) return bad(res, `Can only ship a LOCKED order (currently ${order.state})`, 409);
  if (!req.file) return bad(res, 'A dispatch proof image is required');
  const dispatchReference = (req.body?.dispatchReference || '').trim();
  const acknowledgeFlag = /^(1|true|yes)$/i.test(String(req.body?.acknowledgeFlag || ''));

  const assessment = await ai.verifyDispatchProof({
    filePath: path.join(config.paths.uploads, req.file.filename),
    itemDescription: order.item_description,
  });

  const evidence = svc.addEvidence({
    orderId: order.id, side: 'VENDOR', storedFile: req.file.filename,
    note: dispatchReference ? `Dispatch ref: ${dispatchReference}` : null, aiAssessment: assessment,
  });

  // Block progress on a genuine AI failure (assist), unless explicitly acknowledged.
  if (assessment.available && assessment.passed === false && !acknowledgeFlag) {
    return res.status(422).json({
      error: 'Dispatch proof was flagged by AI verification. Please re-submit genuine proof.',
      assessment, evidence: { id: evidence.id, url: `/uploads/${req.file.filename}` },
      order: svc.serializeOrder(order),
    });
  }

  const shipped = svc.markShipped(order, { dispatchReference });
  res.json(svc.serializeOrder(shipped));
}));

/* Vendor: report delivery → opens the buyer confirmation window (starts the timer). */
router.post('/:ref/deliver', loadOrder, ah(async (req, res) => {
  if (req.order.state !== STATES.SHIPPED) return bad(res, `Can only mark delivered from SHIPPED (currently ${req.order.state})`, 409);
  const order = svc.reportDelivery(req.order);
  res.json(svc.serializeOrder(order));
}));

/* Buyer: confirm received → real release to vendor (may require OTP authorization). */
router.post('/:ref/confirm', loadOrder, ah(async (req, res) => {
  if (req.order.state !== STATES.DELIVERY_WINDOW) return bad(res, `Nothing to confirm (order is ${req.order.state})`, 409);
  const result = await svc.buyerConfirm(req.order);
  res.json(svc.serializeOrder(result.order || svc.getOrderById(req.order.id)));
}));

/* Authorize a pending release with the Monnify OTP → completes the real transfer. */
router.post('/:ref/authorize-release', loadOrder, ah(async (req, res) => {
  const otp = String(req.body?.otp || '').trim();
  if (!otp) return bad(res, 'otp is required');
  const order = await svc.authorizeRelease(req.order, { otp });
  res.json(svc.serializeOrder(order));
}));

/* Ask Monnify to resend the release OTP. */
router.post('/:ref/resend-otp', loadOrder, ah(async (req, res) => {
  const r = await svc.resendReleaseOtp(req.order);
  res.json(r);
}));

/* Buyer: dispute (tap No) → freezes funds, uploads problem proof, runs AI checks. */
router.post('/:ref/dispute', loadOrder, upload.single('proof'), ah(async (req, res) => {
  const order = req.order;
  if (order.state !== STATES.DELIVERY_WINDOW) return bad(res, `Cannot dispute an order in state ${order.state}`, 409);
  const reason = (req.body?.reason || 'Item not as described').trim();

  // Freeze first — the buyer's right to dispute does not depend on AI.
  svc.openDispute(order, { reason });

  let assessment = null;
  let comparison = null;
  if (req.file) {
    const problemPath = path.join(config.paths.uploads, req.file.filename);
    const vendorEv = svc.latestVendorEvidence(order.id);

    if (vendorEv) {
      // One combined two-image call: buyer proof assessment + dispatch-vs-delivered comparison.
      const analysis = await ai.analyzeDispute({
        dispatchFilePath: path.join(config.paths.uploads, vendorEv.stored_file),
        problemFilePath: problemPath,
        itemDescription: order.item_description,
        complaint: reason,
      });
      if (analysis.available) {
        assessment = analysis.buyerProof;
        comparison = analysis.comparison;
        svc.saveDisputeAiComparison(order.id, comparison);
      } else {
        assessment = { available: false, reason: analysis.reason };
      }
    } else {
      assessment = await ai.verifyProblemProof({ filePath: problemPath, itemDescription: order.item_description, complaint: reason });
    }
    svc.addEvidence({ orderId: order.id, side: 'BUYER', storedFile: req.file.filename, note: reason, aiAssessment: assessment });
  }

  res.json({ order: svc.serializeOrder(svc.getOrderById(order.id)), assessment, comparison });
}));

/* Vendor: respond to a dispute — ACCEPT (refund) or CONTEST (escalate to human review). */
router.post('/:ref/vendor-response', loadOrder, ah(async (req, res) => {
  const response = String(req.body?.response || '').toUpperCase();
  if (!['ACCEPT', 'CONTEST'].includes(response)) return bad(res, 'response must be ACCEPT or CONTEST');
  if (req.order.state !== STATES.DISPUTED) return bad(res, `No open dispute to respond to (order is ${req.order.state})`, 409);
  const result = await svc.vendorRespondToDispute(req.order, { response });
  res.json(svc.serializeOrder(result.order));
}));

export default router;
