import { useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import { naira } from '../lib/format.js';
import { Shield, Spinner, Lock } from './Icons.jsx';

/**
 * Authorizes a real Monnify disbursement that returned PENDING_AUTHORIZATION.
 * Monnify emails the OTP to the account holder; entering it completes the transfer.
 */
export function OtpPrompt({ order, onDone }) {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const toast = useToast();
  const amount = order.amountPaid || order.amount;

  async function submit(e) {
    e.preventDefault();
    if (!otp.trim()) return toast('Enter the OTP Monnify sent', 'error');
    setBusy(true);
    try {
      await api.authorizeRelease(order.ref, otp.trim());
      toast('Transfer authorized — vendor paid', 'success');
      onDone?.();
    } catch (err) {
      toast(err.message || 'Invalid authorization code', 'error');
    } finally { setBusy(false); }
  }

  async function resend() {
    setResending(true);
    try { await api.resendOtp(order.ref); toast('Monnify resent the OTP', 'success'); }
    catch (err) { toast(err.message, 'error'); }
    finally { setResending(false); }
  }

  return (
    <div className="rounded-xl2 border border-gold/50 bg-gold-soft/50 p-4 sm:p-5 animate-pop-in">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-gold"><Lock width={18} height={18} /></span>
        <div>
          <h3 className="font-semibold text-ink">Authorize the payout</h3>
          <p className="text-xs text-muted">Real Monnify transfer of <span className="font-mono">{naira(amount)}</span> — awaiting OTP.</p>
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-muted my-3">
        Your wallet has Transfer 2FA on, so Monnify emailed a one-time code to authorize this disbursement. Enter it to release the funds.
      </p>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2.5">
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          className="input font-mono text-center text-lg tracking-[0.4em] flex-1"
          placeholder="······"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          aria-label="Monnify authorization OTP"
        />
        <button type="submit" disabled={busy} className="btn-gold">
          {busy ? <><Spinner width={18} height={18} /> Authorizing…</> : <><Shield width={18} height={18} /> Authorize &amp; pay</>}
        </button>
      </form>
      <div className="mt-2.5 flex items-center justify-between">
        <button type="button" onClick={resend} disabled={resending} className="text-xs font-medium text-gold-deep hover:text-ink transition-colors cursor-pointer">
          {resending ? 'Resending…' : 'Resend code'}
        </button>
        <span className="font-mono text-[11px] text-muted">ref {order.releaseAuthorization?.reference}</span>
      </div>
    </div>
  );
}
