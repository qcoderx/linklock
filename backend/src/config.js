import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const bool = (v, d = false) => (v == null ? d : /^(1|true|yes|on)$/i.test(String(v).trim()));
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),
  appBaseUrl: (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, ''),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:4000').replace(/\/$/, ''),

  paths: {
    root,
    data: path.join(root, 'data'),
    db: path.join(root, 'data', 'linklock.db'),
    uploads: path.join(root, 'uploads'),
  },

  monnify: {
    baseUrl: (process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com').replace(/\/$/, ''),
    apiKey: process.env.MONNIFY_API_KEY || '',
    secretKey: process.env.MONNIFY_SECRET_KEY || '',
    contractCode: (process.env.MONNIFY_CONTRACT_CODE || '').trim(),
    walletAccount: (process.env.MONNIFY_WALLET_ACCOUNT || '').trim(),
    disbursementOtp: (process.env.MONNIFY_DISBURSEMENT_OTP || '').trim(),
  },

  llm: {
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'qwen/qwen3.6-27b',
  },

  escrow: {
    deliveryWindowHours: num(process.env.DELIVERY_WINDOW_HOURS, 24),
    deliveryWindowSeconds: num(process.env.DELIVERY_WINDOW_SECONDS, 0),
  },

  adminToken: process.env.ADMIN_TOKEN || 'change-me-admin-token',
  demoMode: bool(process.env.DEMO_MODE, true),
};

/**
 * SIMULATION mode: when there is no usable Monnify contract code we cannot mint real
 * reserved accounts, so LinkLock simulates account creation + inbound payment locally.
 * Every other rule (state machine, idempotency, AI, disputes) runs identically.
 */
export const monnifyLive = Boolean(
  config.monnify.apiKey && config.monnify.secretKey && config.monnify.contractCode,
);

/** How long the buyer confirmation window stays open, in milliseconds. */
export function deliveryWindowMs() {
  if (config.escrow.deliveryWindowSeconds > 0) {
    return config.escrow.deliveryWindowSeconds * 1000;
  }
  return config.escrow.deliveryWindowHours * 60 * 60 * 1000;
}

export function summarizeConfig() {
  return {
    env: config.env,
    port: config.port,
    monnifyMode: monnifyLive ? 'LIVE (sandbox)' : 'SIMULATION (no contract code)',
    monnifyContractCode: config.monnify.contractCode ? 'set' : 'missing',
    llmModel: config.llm.model,
    llmConfigured: Boolean(config.llm.apiKey),
    deliveryWindow: config.escrow.deliveryWindowSeconds > 0
      ? `${config.escrow.deliveryWindowSeconds}s (demo override)`
      : `${config.escrow.deliveryWindowHours}h`,
    demoMode: config.demoMode,
  };
}
