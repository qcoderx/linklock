import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/Layout.jsx';
import { CopyField } from '../components/CopyField.jsx';
import { useToast } from '../components/Toast.jsx';
import { Lock, Shield, Sparkles, Link as LinkIcon, Arrow, Spinner, Check, Truck, Alert } from '../components/Icons.jsx';
import { api } from '../lib/api.js';
import { naira } from '../lib/format.js';

const STEPS = [
  { img: '/assets/icon-link.png', t: 'Drop a link', d: 'Type the order once. LinkLock mints an isolated bank account and hands you a link to drop in the chat.' },
  { img: '/assets/icon-lock.png', t: 'Money is caught & locked', d: 'The buyer pays from their normal banking app. The instant it lands, it locks — and the vendor is told it is safe to ship.' },
  { img: '/assets/icon-ship.png', t: 'Ship with proof', d: 'The vendor uploads a photo of the sealed item. AI checks it is genuine before the order can progress.' },
  { img: '/assets/icon-check.png', t: 'Release or dispute', d: 'Buyer taps confirm and the vault pays out in seconds. Silence auto-releases. A problem freezes the funds — cleanly reversible.' },
];

export default function Home() {
  const [banks, setBanks] = useState([]);
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({
    itemDescription: '', amount: '', buyerContact: '',
    vendorName: '', vendorBankCode: '', vendorAccountNumber: '', vendorAccountName: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);
  const [resolve, setResolve] = useState({ state: 'idle', name: '', error: '' }); // idle|resolving|ok|error
  const toast = useToast();

  useEffect(() => {
    api.banks().then(setBanks).catch(() => setBanks([]));
    api.status().then(setStatus).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = useMemo(() =>
    form.itemDescription.trim().length > 1 && Number(form.amount) > 0 &&
    form.vendorBankCode && /^\d{10}$/.test(form.vendorAccountNumber), [form]);

  // Live name enquiry: resolve the payout account holder as soon as bank + 10 digits are entered.
  useEffect(() => {
    const acct = form.vendorAccountNumber;
    if (!form.vendorBankCode || !/^\d{10}$/.test(acct)) {
      setResolve({ state: 'idle', name: '', error: '' });
      return;
    }
    let cancelled = false;
    setResolve({ state: 'resolving', name: '', error: '' });
    const t = setTimeout(async () => {
      try {
        const r = await api.resolveAccount(form.vendorBankCode, acct);
        if (cancelled) return;
        setResolve({ state: 'ok', name: r.accountName, error: '' });
        setForm((f) => ({ ...f, vendorAccountName: r.accountName }));
      } catch (err) {
        if (cancelled) return;
        setResolve({ state: 'error', name: '', error: err.message || 'Could not verify account' });
        setForm((f) => ({ ...f, vendorAccountName: '' }));
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.vendorBankCode, form.vendorAccountNumber]);

  async function submit(e) {
    e.preventDefault();
    if (!valid) return toast('Fill item, amount, bank and a 10-digit account number', 'error');
    setSubmitting(true);
    try {
      const order = await api.createOrder({ ...form, amount: Number(form.amount) });
      setCreated(order);
      toast('Locked link created', 'success');
    } catch (err) {
      toast(err.message || 'Could not create link', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Page>
      {/* HERO */}
      <section className="grid lg:grid-cols-[1.05fr_0.95fr] gap-8 lg:gap-12 items-start">
        <div className="pt-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-muted shadow-sm">
            <Shield width={14} height={14} className="text-gold-deep" />
            APIConf Lagos × Monnify · non-custodial escrow
          </span>
          <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-[1.03] tracking-tight text-ink">
            Escrow at the speed<br />of a <span className="relative whitespace-nowrap">transfer
              <svg className="absolute -bottom-1 left-0 w-full" height="10" viewBox="0 0 200 10" fill="none" preserveAspectRatio="none"><path d="M2 7c40-5 158-5 196 0" stroke="#F5B301" strokeWidth="4" strokeLinecap="round"/></svg>
            </span>.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted max-w-xl">
            Others treat escrow as a wallet you sign up for. LinkLock treats it as a link that creates a
            locked, isolated bank account per order. No signup. No app. And we
            <span className="text-ink font-semibold"> never hold your money</span>.
          </p>

          <div className="mt-7 grid sm:grid-cols-2 gap-3 max-w-xl">
            {STEPS.map((s, i) => (
              <div key={s.t} className="flex gap-3 rounded-xl2 border border-line bg-paper p-3.5 shadow-sm transition-shadow hover:shadow-ticket">
                <img src={s.img} alt="" aria-hidden="true" className="mt-0.5 h-12 w-12 shrink-0 object-contain drop-shadow-[0_6px_10px_rgba(224,148,0,0.25)]" />
                <div>
                  <div className="text-sm font-semibold text-ink flex items-center gap-2">
                    <span className="font-mono text-[11px] text-gold-deep">0{i + 1}</span>{s.t}
                  </div>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* GENERATOR / RESULT */}
        <div className="lg:sticky lg:top-24 relative">
          <img
            src="/assets/hero-padlock.png"
            alt="LinkLock secure vault"
            className="pointer-events-none select-none absolute -top-12 -right-3 sm:-right-5 w-24 sm:w-28 md:w-32 z-20 animate-float drop-shadow-[0_20px_34px_rgba(224,148,0,0.4)]"
          />
          {created ? (
            <CreatedCard order={created} onReset={() => { setCreated(null); setForm((f) => ({ ...f, itemDescription: '', amount: '', buyerContact: '' })); }} />
          ) : (
            <form onSubmit={submit} className="card p-5 sm:p-6 animate-rise">
              <div className="mb-4 pr-16">
                <h2 className="text-lg font-bold text-ink leading-tight">Create a locked link</h2>
                <p className="text-xs text-muted">Takes about five seconds. No account.</p>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="label" htmlFor="item">What are you selling?</label>
                  <input id="item" className="input" placeholder="Oversized hoodie, black, size L" value={form.itemDescription} onChange={set('itemDescription')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="amount">Amount (₦)</label>
                    <input id="amount" inputMode="decimal" className="input font-mono" placeholder="25000" value={form.amount} onChange={set('amount')} />
                  </div>
                  <div>
                    <label className="label" htmlFor="buyer">Buyer contact <span className="text-muted font-normal">(optional)</span></label>
                    <input id="buyer" className="input" placeholder="+2348012345678" value={form.buyerContact} onChange={set('buyerContact')} />
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-canvas/70 p-3.5 space-y-3">
                  <div className="eyebrow flex items-center gap-1.5"><Arrow width={13} height={13} /> Where you get paid on release</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor="bank">Bank</label>
                      <select id="bank" className="input" value={form.vendorBankCode} onChange={set('vendorBankCode')}>
                        <option value="">Select bank…</option>
                        {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="acct">Account number</label>
                      <input id="acct" inputMode="numeric" maxLength={10} className="input font-mono" placeholder="0068687503" value={form.vendorAccountNumber} onChange={set('vendorAccountNumber')} />
                    </div>
                  </div>

                  <AccountResolution resolve={resolve} />

                  <div>
                    <label className="label" htmlFor="vname">Your business name <span className="text-muted font-normal">(optional)</span></label>
                    <input id="vname" className="input" placeholder="Boutique XYZ" value={form.vendorName} onChange={set('vendorName')} />
                  </div>
                </div>
              </div>

              <button type="submit" disabled={!valid || submitting} className="btn-gold w-full mt-4">
                {submitting ? <><Spinner width={18} height={18} /> Creating…</> : <><Lock width={18} height={18} /> Generate locked link</>}
              </button>
              {status && (
                <p className="mt-3 text-center text-[11px] font-mono text-muted">
                  Monnify: {status.monnifyMode} · window {status.deliveryWindow}
                </p>
              )}
            </form>
          )}
        </div>
      </section>
    </Page>
  );
}

function AccountResolution({ resolve }) {
  if (resolve.state === 'idle') return null;
  if (resolve.state === 'resolving') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-muted">
        <Spinner width={15} height={15} /> Verifying account…
      </div>
    );
  }
  if (resolve.state === 'ok') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-state-safe/10 border border-state-safe/25 px-3 py-2 animate-pop-in">
        <Check width={16} height={16} className="text-state-safe shrink-0" />
        <span className="font-mono text-sm font-medium text-ink uppercase truncate">{resolve.name}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg bg-state-freeze/10 border border-state-freeze/25 px-3 py-2 text-sm text-state-freeze">
      <Alert width={15} height={15} className="shrink-0" />
      <span className="truncate">Couldn’t verify this account — double-check the number.</span>
    </div>
  );
}

function CreatedCard({ order, onReset }) {
  const origin = window.location.origin;
  return (
    <div className="card p-5 sm:p-6 animate-pop-in">
      <div className="flex items-center gap-2 text-state-safe mb-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-state-safe/10"><Check width={18} height={18} /></span>
        <span className="font-semibold">Locked link ready</span>
      </div>
      <p className="text-sm text-muted mb-4">
        Order <span className="font-mono text-ink">{order.ref}</span> · {order.itemDescription} · <span className="font-mono">{naira(order.amount)}</span>
      </p>

      <div className="space-y-3">
        <CopyField label="Buyer link — drop this in the chat" value={`${origin}${order.payLink.replace(/^https?:\/\/[^/]+/, '')}`} />
        <CopyField label="Your vendor console" value={`${origin}/vendor/${order.ref}`} />
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
        <Link to={`/o/${order.ref}`} className="btn-gold flex-1"><LinkIcon width={17} height={17} /> Open buyer page</Link>
        <Link to={`/vendor/${order.ref}`} className="btn-ghost flex-1">Manage order <Arrow width={16} height={16} /></Link>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-gold-soft/60 border border-gold/30 px-3.5 py-2.5">
        <Sparkles width={16} height={16} className="mt-0.5 shrink-0 text-gold-deep" />
        <p className="text-[12.5px] leading-snug text-ink/80">
          Money will sit in an isolated account tagged to <span className="font-mono">{order.ref}</span> — not in a LinkLock balance.
          {order.accountMode !== 'LIVE' && ' (Simulation mode — set a Monnify contract code for live accounts.)'}
        </p>
      </div>

      <button onClick={onReset} className="mt-3 w-full text-center text-sm text-muted hover:text-ink transition-colors cursor-pointer">
        + Create another link
      </button>
    </div>
  );
}
