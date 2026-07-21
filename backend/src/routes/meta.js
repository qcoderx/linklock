import { Router } from 'express';
import { config, monnifyLive, summarizeConfig } from '../config.js';
import { getBanks, validateAccount } from '../lib/monnify.js';

const router = Router();

let banksCache = { at: 0, data: null };
const FALLBACK_BANKS = [
  { code: '044', name: 'Access Bank' }, { code: '023', name: 'Citibank' },
  { code: '050', name: 'Ecobank Nigeria' }, { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' }, { code: '214', name: 'First City Monument Bank' },
  { code: '058', name: 'Guaranty Trust Bank' }, { code: '030', name: 'Heritage Bank' },
  { code: '301', name: 'Jaiz Bank' }, { code: '082', name: 'Keystone Bank' },
  { code: '50515', name: 'Moniepoint MFB' }, { code: '076', name: 'Polaris Bank' },
  { code: '101', name: 'Providus Bank' }, { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '068', name: 'Standard Chartered' }, { code: '232', name: 'Sterling Bank' },
  { code: '033', name: 'United Bank For Africa' }, { code: '032', name: 'Union Bank' },
  { code: '035', name: 'Wema Bank' }, { code: '057', name: 'Zenith Bank' },
  { code: '999992', name: 'OPay' }, { code: '999991', name: 'PalmPay' }, { code: '50211', name: 'Kuda Bank' },
];

router.get('/status', (_req, res) => {
  res.json({ ok: true, service: 'linklock', ...summarizeConfig() });
});

// Name enquiry: resolve the account holder's name for a bank + account number.
router.get('/banks/resolve', async (req, res) => {
  const accountNumber = String(req.query.accountNumber || '').trim();
  const bankCode = String(req.query.bankCode || '').trim();
  if (!/^\d{10}$/.test(accountNumber) || !bankCode) {
    return res.status(400).json({ error: 'accountNumber (10 digits) and bankCode are required' });
  }
  try {
    const rb = await validateAccount({ accountNumber, bankCode });
    res.json({ accountName: rb.accountName, accountNumber: rb.accountNumber, bankCode: rb.bankCode });
  } catch (err) {
    res.status(422).json({ error: err.message || 'Could not resolve this account' });
  }
});

router.get('/banks', async (_req, res) => {
  if (banksCache.data && Date.now() - banksCache.at < 24 * 60 * 60 * 1000) {
    return res.json(banksCache.data);
  }
  try {
    const banks = await getBanks();
    const cleaned = (banks || [])
      .filter((b) => b.code && b.name)
      .map((b) => ({ code: b.code, name: b.name }));
    banksCache = { at: Date.now(), data: cleaned.length ? cleaned : FALLBACK_BANKS };
  } catch (err) {
    console.warn('[meta] bank list fetch failed, using fallback:', err.message);
    banksCache = { at: Date.now(), data: FALLBACK_BANKS };
  }
  res.json(banksCache.data);
});

export default router;
