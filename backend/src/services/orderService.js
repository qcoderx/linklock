import { db, now } from '../db.js';
import { config, monnifyLive, deliveryWindowMs } from '../config.js';
import { uid, orderRef } from '../lib/ids.js';
import { STATES, TERMINAL, assertTransition, STATE_LABELS } from '../stateMachine.js';
import { sendMessage, listMessages } from '../lib/notify.js';
import * as monnify from '../lib/monnify.js';

/* ─────────────────────────── helpers ─────────────────────────── */

function recordEvent(orderId, type, fromState, toState, detail) {
  db.prepare(
    `INSERT INTO events (id, order_id, type, from_state, to_state, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(uid('evt'), orderId, type, fromState || null, toState || null, detail ? JSON.stringify(detail) : null, now());
}

function setState(order, toState, detail) {
  assertTransition(order.state, toState);
  db.prepare('UPDATE orders SET state = ?, updated_at = ? WHERE id = ?').run(toState, now(), order.id);
  recordEvent(order.id, 'TRANSITION', order.state, toState, detail);
  order.state = toState;
  return order;
}

export function getOrderByRef(ref) {
  return db.prepare('SELECT * FROM orders WHERE ref = ?').get(ref);
}
export function getOrderById(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}
export function getOrderByVaRef(vaRef) {
  return db.prepare('SELECT * FROM orders WHERE va_reference = ?').get(vaRef);
}

/**
 * Idempotent money-movement writer. Keyed by idempotency_key (UNIQUE): a duplicate
 * webhook or retry that reuses the key is a no-op and returns the existing row.
 * `run` performs the real side effect and returns { reference, status, detail }.
 */
async function recordMoney(orderId, type, amount, idempotencyKey, run) {
  const existing = db.prepare('SELECT * FROM transactions WHERE idempotency_key = ?').get(idempotencyKey);
  if (existing) return { txn: existing, fresh: false };

  const id = uid('txn');
  db.prepare(
    `INSERT INTO transactions (id, order_id, type, amount, idempotency_key, status, occurred_at)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
  ).run(id, orderId, type, amount, idempotencyKey, now());

  let outcome;
  try {
    outcome = await run();
  } catch (err) {
    db.prepare('UPDATE transactions SET status = ?, detail = ? WHERE id = ?').run(
      'FAILED', JSON.stringify({ error: err.message, payload: err.payload ?? null }), id,
    );
    throw err;
  }
  db.prepare('UPDATE transactions SET status = ?, monnify_reference = ?, detail = ? WHERE id = ?').run(
    outcome.status || 'SUCCESS', outcome.reference || null, outcome.detail ? JSON.stringify(outcome.detail) : null, id,
  );
  return { txn: db.prepare('SELECT * FROM transactions WHERE id = ?').get(id), fresh: true };
}

/* ─────────────────────────── create ─────────────────────────── */

export async function createOrder(input) {
  const id = uid('ord');
  const ref = orderRef();
  const accountRef = `LL-${ref}-${Date.now().toString(36)}`;
  const ts = now();

  const base = {
    id,
    ref,
    item_description: input.itemDescription,
    amount: Number(input.amount),
    currency: 'NGN',
    buyer_contact: input.buyerContact || null,
    vendor_name: input.vendorName || null,
    vendor_bank_code: input.vendorBankCode,
    vendor_account_number: input.vendorAccountNumber,
    vendor_account_name: input.vendorAccountName || input.vendorName || null,
    state: STATES.CREATED,
    va_reference: accountRef,
    created_at: ts,
    updated_at: ts,
  };

  // Mint the isolated per-order account (real Monnify) or simulate it.
  let account;
  let mode = 'SIMULATION';
  if (monnifyLive) {
    try {
      const rb = await monnify.createReservedAccount({
        accountReference: accountRef,
        accountName: `LinkLock ${ref}`,
        customerEmail: `${ref}@linklock.pay`,
        customerName: input.vendorName || 'LinkLock Vendor',
      });
      const acc = rb.accounts?.[0] || {};
      account = {
        bankName: acc.bankName,
        bankCode: acc.bankCode,
        accountNumber: acc.accountNumber,
        accountName: acc.accountName || rb.accountName,
      };
      mode = 'LIVE';
    } catch (err) {
      // Fall back to simulation so link generation never fails during a demo.
      console.warn(`[orders] reserved-account failed, using simulation for ${ref}: ${err.message}`);
      account = simulatedAccount(ref);
    }
  } else {
    account = simulatedAccount(ref);
  }

  db.prepare(
    `INSERT INTO orders (
      id, ref, item_description, amount, currency, buyer_contact,
      vendor_name, vendor_bank_code, vendor_account_number, vendor_account_name,
      state, account_mode, va_bank_name, va_bank_code, va_account_number, va_account_name,
      va_reference, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    base.id, base.ref, base.item_description, base.amount, base.currency, base.buyer_contact,
    base.vendor_name, base.vendor_bank_code, base.vendor_account_number, base.vendor_account_name,
    base.state, mode, account.bankName, account.bankCode, account.accountNumber, account.accountName,
    base.va_reference, base.created_at, base.updated_at,
  );

  recordEvent(id, 'CREATED', null, STATES.CREATED, { mode });
  return getOrderById(id);
}

/** True only when a real Monnify collection backs this order (so a real refund is possible). */
function hasRealPayment(order) {
  return order.account_mode === 'LIVE' && order.payment_reference && !String(order.payment_reference).startsWith('SIM');
}

const SUCCESS_STATUSES = ['SUCCESS', 'SUCCESSFUL', 'COMPLETED'];

/* Release-transaction helpers (release can legitimately sit PENDING while awaiting an OTP). */
function getReleaseTxn(orderId) {
  return db.prepare('SELECT * FROM transactions WHERE idempotency_key = ?').get(`${orderId}-release`);
}
function insertPendingRelease(orderId, amount, reference, detail) {
  const id = uid('txn');
  db.prepare(
    `INSERT INTO transactions (id, order_id, type, amount, idempotency_key, status, monnify_reference, detail, occurred_at)
     VALUES (?, ?, 'RELEASE', ?, ?, 'PENDING', ?, ?, ?)`,
  ).run(id, orderId, amount, `${orderId}-release`, reference || null, detail ? JSON.stringify(detail) : null, now());
  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
}
function markTxn(id, status, reference, detail) {
  db.prepare('UPDATE transactions SET status = ?, monnify_reference = COALESCE(?, monnify_reference), detail = ? WHERE id = ?')
    .run(status, reference || null, detail ? JSON.stringify(detail) : null, id);
}

/** Complete a release once the money is confirmed: transition (if applicable) + notify. */
function finalizeRelease(order, { trigger, amount }) {
  db.prepare('UPDATE orders SET released_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), order.id);
  if ([STATES.DELIVERY_WINDOW, STATES.UNDER_REVIEW].includes(order.state)) {
    setState({ ...order }, STATES.RELEASED, { trigger });
  }
  markDisputeResolved(order.id, 'RELEASE', `Released to vendor (${trigger}).`);
  sendMessage(order.id, 'VENDOR', 'RELEASED',
    `💸 ${order.ref}: ₦${fmt(amount)} released to your account (${order.vendor_account_number}). Trigger: ${trigger}.`);
}

function simulatedAccount(ref) {
  // Deterministic-looking sandbox account for simulation mode.
  const n = '99' + String(Math.abs(hashCode(ref)) % 100000000).padStart(8, '0');
  return { bankName: 'LinkLock Vault Bank (Sandbox)', bankCode: '50515', accountNumber: n, accountName: `LinkLock ${ref}` };
}
function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/* ─────────────────── inbound payment: CREATED → LOCKED ─────────────────── */

export async function handleInboundPayment({ order, amountPaid, paymentReference, transactionReference, source }) {
  if (order.state !== STATES.CREATED) {
    // Already locked (idempotent webhook) or further along — nothing to do.
    return { order: getOrderById(order.id), alreadyProcessed: true };
  }

  const { fresh } = await recordMoney(order.id, 'LOCK', amountPaid, `${order.id}-lock`, async () => ({
    status: 'SUCCESS',
    reference: transactionReference || paymentReference,
    detail: { paymentReference, transactionReference, source },
  }));

  db.prepare(
    `UPDATE orders SET amount_paid = ?, payment_reference = ?, buyer_source_account = ?,
       buyer_source_bank_code = ?, buyer_source_name = ?, updated_at = ? WHERE id = ?`,
  ).run(
    amountPaid, transactionReference || paymentReference || null,
    source?.accountNumber || null, source?.bankCode || null, source?.accountName || null,
    now(), order.id,
  );

  setState(order, STATES.LOCKED, { amountPaid, paymentReference: transactionReference || paymentReference });

  sendMessage(
    order.id, 'VENDOR', 'SAFE_TO_SHIP',
    `✅ Payment secured for ${order.ref}. ₦${fmt(amountPaid)} is locked in an isolated account — it is safe to ship "${order.item_description}". Upload your dispatch proof to release.`,
  );

  return { order: getOrderById(order.id), fresh };
}

/** DEMO helper: mimic the Monnify inbound webhook without a real bank transfer. */
export async function simulateInboundPayment(order) {
  return handleInboundPayment({
    order,
    amountPaid: order.amount,
    paymentReference: `SIM-PAY-${order.ref}`,
    transactionReference: `SIM-TXN-${order.id.slice(-8)}`,
    source: { accountNumber: '0000000000', bankCode: '000', accountName: order.buyer_contact || 'Simulated Buyer' },
  });
}

/* ─────────────────── ship & prove: LOCKED → SHIPPED ─────────────────── */

export function markShipped(order, { dispatchReference }) {
  assertTransition(order.state, STATES.SHIPPED);
  db.prepare('UPDATE orders SET dispatch_reference = ?, updated_at = ? WHERE id = ?').run(
    dispatchReference || null, now(), order.id,
  );
  setState(order, STATES.SHIPPED, { dispatchReference });
  return getOrderById(order.id);
}

/* ─────────────── delivery reported: SHIPPED → DELIVERY_WINDOW ─────────────── */

export function reportDelivery(order) {
  assertTransition(order.state, STATES.DELIVERY_WINDOW);
  const expiresAt = now() + deliveryWindowMs();
  db.prepare('UPDATE orders SET delivery_window_expires_at = ?, updated_at = ? WHERE id = ?').run(
    expiresAt, now(), order.id,
  );
  setState(order, STATES.DELIVERY_WINDOW, { expiresAt });
  const buyerLink = `${config.appBaseUrl}/o/${order.ref}/confirm`;
  sendMessage(
    order.id, 'BUYER', 'CONFIRM_LINK',
    `📦 Your order ${order.ref} was delivered. If it's correct, tap Confirm to release payment. If there's a problem, tap "Something's wrong". ${buyerLink}`,
  );
  return getOrderById(order.id);
}

/* ─────────────────── release to vendor (RELEASED) ─────────────────── */

/**
 * Release funds to the vendor via a REAL Monnify disbursement.
 * Returns { released } on instant success, or { authorizationRequired, reference } when the
 * wallet has Transfer-2FA on (Monnify emails an OTP → complete with authorizeRelease).
 * Idempotent per order via the `${id}-release` transaction key.
 */
export async function releaseToVendor(order, { trigger }) {
  if (![STATES.DELIVERY_WINDOW, STATES.UNDER_REVIEW].includes(order.state)) {
    assertTransition(order.state, STATES.RELEASED); // throws with a clear message
  }
  const amount = order.amount_paid ?? order.amount;

  const existing = getReleaseTxn(order.id);
  if (existing?.status === 'SUCCESS') {
    finalizeRelease(order, { trigger, amount });
    return { released: true, order: getOrderById(order.id) };
  }
  if (existing?.status === 'PENDING') {
    return { authorizationRequired: true, reference: existing.monnify_reference, order: getOrderById(order.id) };
  }

  // Simulation mode — no real payment ever landed, so there is nothing real to disburse.
  if (order.account_mode !== 'LIVE') {
    const txn = insertPendingRelease(order.id, amount, `SIM-REL-${order.id.slice(-8)}`, { simulated: true });
    markTxn(txn.id, 'SUCCESS', txn.monnify_reference, { simulated: true });
    finalizeRelease(order, { trigger, amount });
    return { released: true, order: getOrderById(order.id) };
  }

  // LIVE — real Monnify single disbursement from the wallet.
  const ref = `LL-REL-${order.id.slice(-8)}-${Math.random().toString(36).slice(2, 6)}`;
  const txn = insertPendingRelease(order.id, amount, ref, { initiated: true });
  let res;
  try {
    res = await monnify.disburseSingle({
      amount, reference: ref, narration: `LinkLock release ${order.ref}`,
      destinationBankCode: order.vendor_bank_code,
      destinationAccountNumber: order.vendor_account_number,
      destinationAccountName: order.vendor_account_name || order.vendor_name || 'Vendor',
    });
  } catch (err) {
    db.prepare('DELETE FROM transactions WHERE id = ?').run(txn.id); // allow a clean retry
    throw err;
  }

  if (SUCCESS_STATUSES.includes(res?.status)) {
    markTxn(txn.id, 'SUCCESS', res.reference || ref, { monnifyStatus: res.status, sessionId: res.sessionId });
    finalizeRelease(order, { trigger, amount });
    return { released: true, order: getOrderById(order.id) };
  }
  if (res?.status === 'PENDING_AUTHORIZATION') {
    markTxn(txn.id, 'PENDING', res.reference || ref, { monnifyStatus: 'PENDING_AUTHORIZATION', trigger });
    sendMessage(order.id, 'VENDOR', 'RELEASE_PENDING',
      `🔐 ${order.ref}: payout of ₦${fmt(amount)} initiated — awaiting the Monnify OTP to authorize the transfer.`);
    return { authorizationRequired: true, reference: res.reference || ref, order: getOrderById(order.id) };
  }
  db.prepare('DELETE FROM transactions WHERE id = ?').run(txn.id);
  const e = new Error(`Disbursement not successful (status: ${res?.status || 'unknown'})`); e.status = 502; throw e;
}

/** Authorize a pending release with the OTP Monnify emailed → completes the real transfer. */
export async function authorizeRelease(order, { otp }) {
  const txn = getReleaseTxn(order.id);
  if (!txn || txn.status !== 'PENDING') { const e = new Error('No release is awaiting authorization'); e.status = 409; throw e; }

  if (order.account_mode !== 'LIVE') {
    markTxn(txn.id, 'SUCCESS', txn.monnify_reference, { simulated: true });
    finalizeRelease(order, { trigger: 'OTP_AUTH', amount: txn.amount });
    return getOrderById(order.id);
  }

  let res;
  try {
    res = await monnify.authorizeTransfer(txn.monnify_reference, otp);
  } catch (err) {
    const e = new Error(err.message || 'Invalid authorization code'); e.status = 422; throw e;
  }
  if (!SUCCESS_STATUSES.includes(res?.status)) {
    const e = new Error(`Authorization not successful (status: ${res?.status || 'unknown'})`); e.status = 422; throw e;
  }
  markTxn(txn.id, 'SUCCESS', res.reference || txn.monnify_reference, { monnifyStatus: res.status });
  finalizeRelease(order, { trigger: 'OTP_AUTH', amount: txn.amount });
  return getOrderById(order.id);
}

/** Ask Monnify to resend the release OTP. */
export async function resendReleaseOtp(order) {
  const txn = getReleaseTxn(order.id);
  if (!txn || txn.status !== 'PENDING') { const e = new Error('No release is awaiting authorization'); e.status = 409; throw e; }
  if (order.account_mode !== 'LIVE') return { ok: true, simulated: true };
  await monnify.resendOtp(txn.monnify_reference);
  return { ok: true };
}

/* ─────────────────── reverse to buyer (REVERSED) ─────────────────── */

export async function reverseToBuyer(order, { trigger, reason }) {
  if (![STATES.DISPUTED, STATES.UNDER_REVIEW].includes(order.state)) {
    assertTransition(order.state, STATES.REVERSED);
  }
  const amount = order.amount_paid ?? order.amount;

  await recordMoney(order.id, 'REVERSAL', amount, `${order.id}-reversal`, async () => {
    if (hasRealPayment(order)) {
      const res = await monnify.initiateRefund({
        transactionReference: order.payment_reference,
        refundReference: `LL-REV-${order.id.slice(-10)}`,
        refundAmount: amount,
        refundReason: reason || 'LinkLock dispute reversal',
      });
      return { status: 'SUCCESS', reference: res?.refundReference, detail: { monnifyStatus: res?.refundStatus, ...res } };
    }
    // Simulated inbound payment → simulate the reversal (no real collection ref to refund against).
    return { status: 'SUCCESS', reference: `SIM-REV-${order.id.slice(-8)}`, detail: { simulated: true } };
  });

  db.prepare('UPDATE orders SET reversed_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), order.id);
  setState({ ...order, state: order.state }, STATES.REVERSED, { trigger, reason });
  markDisputeResolved(order.id, 'REVERSE', reason || `Reversed to buyer (${trigger}).`);

  sendMessage(order.id, 'BUYER', 'REVERSED',
    `↩️ ${order.ref}: ₦${fmt(amount)} has been reversed to your originating account. ${reason || ''}`.trim());
  return getOrderById(order.id);
}

/* ─────────────────── confirm / dispute (buyer) ─────────────────── */

export async function buyerConfirm(order) {
  return releaseToVendor(order, { trigger: 'BUYER_CONFIRM' });
}

export function openDispute(order, { reason }) {
  assertTransition(order.state, STATES.DISPUTED);
  const disputeId = uid('disp');
  db.prepare(
    `INSERT INTO disputes (id, order_id, opened_by, reason, state, created_at, updated_at)
     VALUES (?, ?, 'BUYER', ?, 'OPEN', ?, ?)`,
  ).run(disputeId, order.id, reason || 'Item not as described', now(), now());
  setState(order, STATES.DISPUTED, { reason });
  sendMessage(order.id, 'VENDOR', 'SAID_NO_PING',
    `⚠️ The customer said NO on ${order.ref} ("${reason || 'Item not as described'}"). Funds are frozen — nobody can move them. Do you ACCEPT (refund the buyer) or CONTEST (assert the item was correct)?`);
  return getDisputeByOrder(order.id);
}

/** Vendor responds to a dispute: ACCEPT → reverse; CONTEST → escalate to human review. */
export async function vendorRespondToDispute(order, { response }) {
  const dispute = getDisputeByOrder(order.id);
  if (!dispute || dispute.state === 'RESOLVED') {
    const e = new Error('No open dispute to respond to'); e.status = 409; throw e;
  }
  db.prepare('UPDATE disputes SET vendor_response = ?, updated_at = ? WHERE id = ?').run(response, now(), dispute.id);

  if (response === 'ACCEPT') {
    await reverseToBuyer(order, { trigger: 'VENDOR_ACCEPT', reason: 'Vendor accepted the dispute.' });
    return { order: getOrderById(order.id), dispute: getDisputeByOrder(order.id) };
  }

  // CONTEST → freeze stays, escalate to human review, run AI comparison as an assist.
  db.prepare('UPDATE disputes SET state = ?, updated_at = ? WHERE id = ?').run('UNDER_REVIEW', now(), dispute.id);
  setState(order, STATES.UNDER_REVIEW, { vendorResponse: 'CONTEST' });
  sendMessage(order.id, 'BUYER', 'UNDER_REVIEW',
    `🧑‍⚖️ ${order.ref}: The vendor contested. Your funds stay frozen and safe while a reviewer decides using both sides' evidence.`);
  return { order: getOrderById(order.id), dispute: getDisputeByOrder(order.id) };
}

/* ─────────────────── human review resolution ─────────────────── */

export async function resolveByHuman(order, { decision, note }) {
  if (order.state !== STATES.UNDER_REVIEW) {
    const e = new Error(`Order ${order.ref} is not under review`); e.status = 409; throw e;
  }
  if (decision === 'RELEASE') {
    const r = await releaseToVendor(order, { trigger: 'HUMAN_RELEASE' });
    return r.order || getOrderById(order.id);
  }
  if (decision === 'REVERSE') {
    return reverseToBuyer(order, { trigger: 'HUMAN_REVERSE', reason: note || 'Reviewer reversed to buyer.' });
  }
  if (decision === 'SPLIT') {
    return splitResolution(order, note);
  }
  const e = new Error('decision must be RELEASE | REVERSE | SPLIT'); e.status = 400; throw e;
}

async function splitResolution(order, note) {
  const amount = order.amount_paid ?? order.amount;
  const half = Math.round((amount / 2) * 100) / 100;

  // Release half (vendor). May land PENDING if the wallet has Transfer-2FA — authorizeRelease completes it.
  if (!getReleaseTxn(order.id)) {
    if (order.account_mode === 'LIVE') {
      const ref = `LL-SPL-REL-${order.id.slice(-8)}-${Math.random().toString(36).slice(2, 6)}`;
      const txn = insertPendingRelease(order.id, half, ref, { split: true });
      let res;
      try {
        res = await monnify.disburseSingle({
          amount: half, reference: ref, narration: `LinkLock split release ${order.ref}`,
          destinationBankCode: order.vendor_bank_code, destinationAccountNumber: order.vendor_account_number,
          destinationAccountName: order.vendor_account_name || order.vendor_name || 'Vendor',
        });
      } catch (err) { db.prepare('DELETE FROM transactions WHERE id = ?').run(txn.id); throw err; }
      if (SUCCESS_STATUSES.includes(res?.status)) markTxn(txn.id, 'SUCCESS', res.reference || ref, { monnifyStatus: res.status, split: true });
      else if (res?.status !== 'PENDING_AUTHORIZATION') { db.prepare('DELETE FROM transactions WHERE id = ?').run(txn.id); const e = new Error(`Split disbursement failed (${res?.status})`); e.status = 502; throw e; }
      // PENDING_AUTHORIZATION → leave PENDING; operator authorizes the payout half via OTP.
    } else {
      const txn = insertPendingRelease(order.id, half, `SIM-SPL-REL-${order.id.slice(-6)}`, { simulated: true, half });
      markTxn(txn.id, 'SUCCESS', txn.monnify_reference, { simulated: true, half });
    }
  }
  await recordMoney(order.id, 'REVERSAL', half, `${order.id}-reversal`, async () => {
    if (hasRealPayment(order)) {
      const res = await monnify.initiateRefund({
        transactionReference: order.payment_reference, refundReference: `LL-SPL-REV-${order.id.slice(-8)}`,
        refundAmount: half, refundReason: 'LinkLock split resolution',
      });
      return { status: 'SUCCESS', reference: res?.refundReference, detail: res };
    }
    return { status: 'SUCCESS', reference: `SIM-SPL-REV-${order.id.slice(-6)}`, detail: { simulated: true, half } };
  });

  db.prepare('UPDATE orders SET released_at = ?, reversed_at = ?, updated_at = ? WHERE id = ?')
    .run(now(), now(), now(), order.id);
  setState(order, STATES.SPLIT, { half });
  markDisputeResolved(order.id, 'SPLIT', note || `Split ₦${fmt(half)} each way.`);
  sendMessage(order.id, 'VENDOR', 'SPLIT', `⚖️ ${order.ref}: split resolution — ₦${fmt(half)} released to you, ₦${fmt(half)} reversed to the buyer.`);
  sendMessage(order.id, 'BUYER', 'SPLIT', `⚖️ ${order.ref}: split resolution — ₦${fmt(half)} reversed to you.`);
  return getOrderById(order.id);
}

/* ─────────────────── default-release sweep ─────────────────── */

export async function runDefaultReleaseSweep() {
  const due = db.prepare(
    `SELECT * FROM orders WHERE state = 'DELIVERY_WINDOW'
       AND delivery_window_expires_at IS NOT NULL AND delivery_window_expires_at <= ?`,
  ).all(now());
  const released = [];
  for (const order of due) {
    // Skip orders whose default-release is already initiated and just awaiting OTP.
    const rel = getReleaseTxn(order.id);
    if (rel?.status === 'PENDING') continue;
    try {
      const r = await releaseToVendor(order, { trigger: 'DEFAULT_RELEASE' });
      if (r.released) released.push(order.ref);
      else if (r.authorizationRequired) console.log(`[sweep] ${order.ref} default-release initiated — awaiting Monnify OTP authorization`);
    } catch (err) {
      console.error(`[sweep] default-release failed for ${order.ref}: ${err.message}`);
    }
  }
  return released;
}

/* ─────────────────── disputes / evidence helpers ─────────────────── */

export function getDisputeByOrder(orderId) {
  return db.prepare('SELECT * FROM disputes WHERE order_id = ? ORDER BY created_at DESC LIMIT 1').get(orderId);
}
function markDisputeResolved(orderId, decision, note) {
  const d = getDisputeByOrder(orderId);
  if (d && d.state !== 'RESOLVED') {
    db.prepare('UPDATE disputes SET state = ?, human_decision = ?, resolution_note = ?, updated_at = ? WHERE id = ?')
      .run('RESOLVED', decision, note || null, now(), d.id);
  }
}
export function saveDisputeAiComparison(orderId, comparison) {
  const d = getDisputeByOrder(orderId);
  if (d) db.prepare('UPDATE disputes SET ai_comparison = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(comparison), now(), d.id);
}

export function addEvidence({ orderId, side, storedFile, note, aiAssessment, mediaType = 'image' }) {
  const id = uid('ev');
  db.prepare(
    `INSERT INTO evidence (id, order_id, side, media_type, stored_file, note, ai_assessment, captured_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(id, orderId, side, mediaType, storedFile, note || null, aiAssessment ? JSON.stringify(aiAssessment) : null, now());
  return db.prepare('SELECT * FROM evidence WHERE id = ?').get(id);
}
export function listEvidence(orderId) {
  return db.prepare('SELECT * FROM evidence WHERE order_id = ? ORDER BY captured_at ASC').all(orderId);
}
export function latestVendorEvidence(orderId) {
  return db.prepare("SELECT * FROM evidence WHERE order_id = ? AND side = 'VENDOR' ORDER BY captured_at DESC LIMIT 1").get(orderId);
}

/* ─────────────────── serialization for the API ─────────────────── */

export const fmt = (n) => Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parse(json) {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

export function serializeOrder(order, { includePrivate = false } = {}) {
  const evidence = listEvidence(order.id).map((e) => ({
    id: e.id, side: e.side, mediaType: e.media_type,
    url: `/uploads/${e.stored_file}`, note: e.note,
    aiAssessment: parse(e.ai_assessment), capturedAt: e.captured_at,
  }));
  const transactions = db.prepare('SELECT * FROM transactions WHERE order_id = ? ORDER BY occurred_at ASC').all(order.id)
    .map((t) => ({ id: t.id, type: t.type, amount: t.amount, status: t.status, monnifyReference: t.monnify_reference, detail: parse(t.detail), occurredAt: t.occurred_at }));
  const dispute = getDisputeByOrder(order.id);
  const messages = listMessages(order.id).map((m) => ({ id: m.id, audience: m.audience, kind: m.kind, body: m.body, createdAt: m.created_at }));
  const pendingRelease = transactions.find((t) => t.type === 'RELEASE' && t.status === 'PENDING');

  return {
    id: order.id,
    ref: order.ref,
    releaseAuthorization: pendingRelease ? { required: true, reference: pendingRelease.monnifyReference } : null,
    itemDescription: order.item_description,
    amount: order.amount,
    amountPaid: order.amount_paid,
    currency: order.currency,
    buyerContact: order.buyer_contact,
    vendor: {
      name: order.vendor_name,
      bankCode: order.vendor_bank_code,
      accountNumber: includePrivate ? order.vendor_account_number : maskAccount(order.vendor_account_number),
      accountName: order.vendor_account_name,
    },
    state: order.state,
    stateLabel: STATE_LABELS[order.state] || order.state,
    accountMode: order.account_mode,
    virtualAccount: {
      bankName: order.va_bank_name,
      bankCode: order.va_bank_code,
      accountNumber: order.va_account_number,
      accountName: order.va_account_name,
      reference: order.va_reference,
    },
    dispatchReference: order.dispatch_reference,
    deliveryWindowExpiresAt: order.delivery_window_expires_at,
    releasedAt: order.released_at,
    reversedAt: order.reversed_at,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    payLink: `${config.appBaseUrl}/o/${order.ref}`,
    evidence,
    transactions,
    messages,
    dispute: dispute ? {
      id: dispute.id, openedBy: dispute.opened_by, reason: dispute.reason,
      vendorResponse: dispute.vendor_response, state: dispute.state,
      humanDecision: dispute.human_decision, resolutionNote: dispute.resolution_note,
      aiComparison: parse(dispute.ai_comparison), createdAt: dispute.created_at,
    } : null,
  };
}

function maskAccount(n) {
  if (!n) return n;
  return n.length <= 4 ? n : `${'•'.repeat(n.length - 4)}${n.slice(-4)}`;
}
