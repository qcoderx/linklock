import crypto from 'node:crypto';
import { config, monnifyLive } from '../config.js';

/**
 * Thin, resilient Monnify (sandbox) client.
 * Docs: https://developers.monnify.com  —  auth via Basic base64(apiKey:secret),
 * all other calls via Bearer token (valid ~1h, cached here).
 */

let tokenCache = { value: null, expiresAt: 0 };

function basicAuthHeader() {
  const raw = `${config.monnify.apiKey}:${config.monnify.secretKey}`;
  return 'Basic ' + Buffer.from(raw).toString('base64');
}

async function monnifyFetch(pathname, { method = 'GET', headers = {}, body } = {}) {
  const url = `${config.monnify.baseUrl}${pathname}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new MonnifyError(`Non-JSON response (${res.status}) from ${pathname}: ${text.slice(0, 200)}`, res.status, text);
  }
  if (!res.ok || json.requestSuccessful === false) {
    throw new MonnifyError(json.responseMessage || `Monnify call failed (${res.status})`, res.status, json);
  }
  return json.responseBody;
}

export class MonnifyError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'MonnifyError';
    this.status = status;
    this.payload = payload;
  }
}

export async function getAccessToken() {
  const skew = 60_000; // refresh a minute early
  if (tokenCache.value && Date.now() < tokenCache.expiresAt - skew) {
    return tokenCache.value;
  }
  const res = await fetch(`${config.monnify.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/json' },
  });
  const json = await res.json();
  if (!res.ok || !json?.responseBody?.accessToken) {
    throw new MonnifyError(json?.responseMessage || 'Monnify auth failed', res.status, json);
  }
  const { accessToken, expiresIn } = json.responseBody;
  tokenCache = {
    value: accessToken,
    expiresAt: Date.now() + (Number(expiresIn) > 0 ? Number(expiresIn) * 1000 : 3600_000),
  };
  return accessToken;
}

async function authed(pathname, opts = {}) {
  const token = await getAccessToken();
  return monnifyFetch(pathname, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
}

/**
 * Reserve a dedicated per-order virtual account.
 * Returns { accountReference, accounts: [{ bankCode, bankName, accountNumber, accountName }] }.
 */
export async function createReservedAccount({ accountReference, accountName, customerEmail, customerName }) {
  const body = {
    accountReference,
    accountName,
    currencyCode: 'NGN',
    contractCode: config.monnify.contractCode,
    customerEmail,
    customerName: customerName || accountName,
    getAllAvailableBanks: true,
  };
  return authed('/api/v2/bank-transfer/reserved-accounts', { method: 'POST', body });
}

export async function getReservedAccountTransactions(accountReference) {
  return authed(
    `/api/v1/bank-transfer/reserved-accounts/transactions?accountReference=${encodeURIComponent(accountReference)}&page=0&size=10`,
  );
}

/**
 * Single disbursement (RELEASE to vendor / could also fund a reversal).
 * Handles Transfer-2FA: if the wallet requires OTP, auto-authorizes with the sandbox OTP.
 */
export async function disburseSingle({ amount, reference, narration, destinationBankCode, destinationAccountNumber, destinationAccountName }) {
  const body = {
    amount,
    reference,
    narration: narration || 'LinkLock escrow release',
    destinationBankCode,
    destinationAccountNumber,
    destinationAccountName,
    currency: 'NGN',
    sourceAccountNumber: config.monnify.walletAccount,
  };
  // Returns the raw responseBody. status is SUCCESS (2FA off) or PENDING_AUTHORIZATION (2FA on,
  // Monnify emails an OTP → authorize via authorizeTransfer). The caller drives the OTP step.
  return authed('/api/v2/disbursements/single', { method: 'POST', body });
}

/** Authorize a PENDING_AUTHORIZATION transfer with the OTP Monnify emailed. */
export async function authorizeTransfer(reference, authorizationCode) {
  return authed('/api/v2/disbursements/single/validate-otp', {
    method: 'POST',
    body: { reference, authorizationCode },
  });
}

/** Ask Monnify to resend the transfer authorization OTP. */
export async function resendOtp(reference) {
  return authed('/api/v2/disbursements/single/resend-otp', {
    method: 'POST',
    body: { reference },
  });
}

export async function getDisbursementStatus(reference) {
  return authed(`/api/v2/disbursements/single/summary?reference=${encodeURIComponent(reference)}`);
}

/** Refund a collected transaction back to the buyer's originating account (clean reversal). */
export async function initiateRefund({ transactionReference, refundReference, refundAmount, refundReason }) {
  return authed('/api/v1/refunds/initiate-refund', {
    method: 'POST',
    body: {
      transactionReference,
      refundReference,
      refundAmount,
      refundReason: refundReason || 'LinkLock dispute reversal',
      customerNote: 'LinkLock escrow refund',
    },
  });
}

export async function getBanks() {
  return authed('/api/v1/banks');
}

/**
 * Name enquiry — resolve the account holder's name for a bank + account number.
 * Free on sandbox and live. Returns { accountNumber, accountName, bankCode }.
 */
export async function validateAccount({ accountNumber, bankCode }) {
  return authed(
    `/api/v1/disbursements/account/validate?accountNumber=${encodeURIComponent(accountNumber)}&bankCode=${encodeURIComponent(bankCode)}`,
  );
}

/**
 * Verify a Monnify webhook: HMAC-SHA512 of the RAW request body, keyed with the secret key,
 * compared to the `monnify-signature` header in constant time.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const computed = crypto
    .createHmac('sha512', config.monnify.secretKey)
    .update(rawBody, 'utf8')
    .digest('hex');
  try {
    const a = Buffer.from(computed);
    const b = Buffer.from(String(signatureHeader));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export { monnifyLive };
