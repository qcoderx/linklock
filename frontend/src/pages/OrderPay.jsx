import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Page } from '../components/Layout.jsx';
import { Lockmark } from '../components/Logo.jsx';
import { CopyField } from '../components/CopyField.jsx';
import { StatusRail } from '../components/StatusRail.jsx';
import { StateBadge } from '../components/StateBadge.jsx';
import { AiVerdict, AiComparison } from '../components/AiVerdict.jsx';
import { EvidenceUpload } from '../components/EvidenceUpload.jsx';
import { OtpPrompt } from '../components/OtpPrompt.jsx';
import { useToast } from '../components/Toast.jsx';
import { useOrder } from '../hooks/useOrder.js';
import { api } from '../lib/api.js';
import { naira, groupAccount, countdown } from '../lib/format.js';
import { Lock, Shield, Check, Alert, Spinner, Sparkles } from '../components/Icons.jsx';

export default function OrderPay() {
  const { ref } = useParams();
  const { order, loading, error, refresh } = useOrder(ref);

  if (loading) return <Page><Loader /></Page>;
  if (error || !order) return <Page><Missing ref={ref} /></Page>;

  return (
    <Page max="max-w-4xl">
      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6 lg:gap-8 items-start">
        <Ticket order={order} refresh={refresh} />
        <aside className="space-y-5">
          <div className="card p-5">
            <div className="eyebrow mb-3">Escrow status</div>
            <StatusRail state={order.state} />
          </div>
          <TrustNote order={order} />
        </aside>
      </div>
    </Page>
  );
}

function Ticket({ order, refresh }) {
  const buyer = order.buyerContact;
  return (
    <div className="animate-rise">
      <div className="relative card overflow-hidden">
        {/* header */}
        <div className="bg-ink text-paper px-5 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Lockmark size={34} />
            <div>
              <div className="text-sm font-semibold leading-tight">Protected by LinkLock</div>
              <div className="font-mono text-[11px] text-paper/60">{order.ref}</div>
            </div>
          </div>
          <StateBadge state={order.state} size="sm" />
        </div>

        {/* perforation */}
        <div className="relative h-3 bg-ink">
          <div className="absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-canvas" />
          <div className="absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-canvas" />
          <div className="perf text-canvas h-full mx-2" />
        </div>

        {/* body */}
        <div className="px-5 sm:px-6 py-5 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="eyebrow">Order</div>
              <div className="mt-1 text-lg font-semibold text-ink leading-snug">{order.itemDescription}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="eyebrow">Amount</div>
              <div className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">{naira(order.amount)}</div>
            </div>
          </div>

          <PayOrStatus order={order} refresh={refresh} />
        </div>
      </div>
      {buyer && <p className="mt-3 text-center text-xs text-muted">Confirmation updates go to <span className="font-mono">{buyer}</span></p>}
    </div>
  );
}

function PayOrStatus({ order, refresh }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function simulate() {
    setBusy(true);
    try { await api.simulatePayment(order.ref); await refresh(); toast('Payment received — funds locked', 'success'); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  // A real disbursement is in flight and needs OTP authorization — show that first.
  if (order.releaseAuthorization?.required) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-state-safe/25 bg-state-safe/5 px-4 py-3 text-sm text-ink flex items-center gap-2">
          <Check width={16} height={16} className="text-state-safe" /> Confirmed. Releasing your payment to the vendor…
        </div>
        <OtpPrompt order={order} onDone={refresh} />
      </div>
    );
  }

  if (order.state === 'CREATED') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl2 border border-gold/40 bg-gold-soft/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield width={18} height={18} className="text-gold-deep" />
            <span className="text-sm font-semibold text-ink">Transfer to this secured account</span>
          </div>
          <CopyField label={`${order.virtualAccount.bankName || 'Bank'} · tap to copy`} value={order.virtualAccount.accountNumber} display={groupAccount(order.virtualAccount.accountNumber)} big />
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><div className="eyebrow">Bank</div><div className="mt-0.5 font-medium text-ink">{order.virtualAccount.bankName}</div></div>
            <div><div className="eyebrow">Account name</div><div className="mt-0.5 font-medium text-ink truncate">{order.virtualAccount.accountName}</div></div>
          </div>
        </div>
        <p className="text-[13px] leading-relaxed text-muted">
          Open your normal banking app and transfer <span className="font-mono text-ink">{naira(order.amount)}</span>.
          The moment it lands, LinkLock locks it and tells the vendor it is safe to ship.
        </p>
        <button onClick={simulate} disabled={busy} className="btn-ink w-full">
          {busy ? <><Spinner width={18} height={18} /> Detecting payment…</> : <>Simulate the transfer (demo) </>}
        </button>
        <p className="text-center text-[11px] text-muted">In production this happens automatically via the Monnify inbound webhook.</p>
      </div>
    );
  }

  if (order.state === 'LOCKED' || order.state === 'SHIPPED') {
    return (
      <div className="space-y-4">
        <LockedBanner amount={order.amountPaid || order.amount} />
        <div className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-muted">
          {order.state === 'LOCKED'
            ? 'The vendor has been told it is safe to ship. You will get a confirm link once it is delivered.'
            : 'The vendor shipped with verified proof. A confirm link opens when delivery is reported.'}
        </div>
      </div>
    );
  }

  if (order.state === 'DELIVERY_WINDOW') return <ConfirmOrDispute order={order} refresh={refresh} />;

  if (order.state === 'RELEASED') return <Outcome tone="safe" icon={Check} title="Released to the vendor" body="The item was confirmed and the vault paid out. This order is complete." order={order} />;
  if (order.state === 'REVERSED') return <Outcome tone="freeze" icon={Check} title="Reversed to you" body="Your money was returned cleanly from the isolated order account to your originating bank." order={order} />;
  if (order.state === 'SPLIT') return <Outcome tone="review" icon={Check} title="Split resolution" body="The reviewer split the funds based on the evidence. See the breakdown below." order={order} />;

  if (order.state === 'DISPUTED' || order.state === 'UNDER_REVIEW') {
    return (
      <div className="space-y-3">
        <Outcome tone={order.state === 'DISPUTED' ? 'freeze' : 'review'} icon={Alert}
          title={order.state === 'DISPUTED' ? 'Funds frozen — vendor notified' : 'Under human review'}
          body={order.state === 'DISPUTED'
            ? 'You raised a dispute. Nobody can move the money while it is open. The vendor has been asked to accept or contest.'
            : 'The vendor contested. A reviewer is deciding using both sides’ evidence. Your funds stay frozen and safe.'} order={order} />
        {order.dispute?.aiComparison && <AiComparison comparison={order.dispute.aiComparison} />}
      </div>
    );
  }
  return null;
}

function LockedBanner({ amount }) {
  return (
    <div className="rounded-xl2 border border-state-safe/25 bg-state-safe/5 p-4 flex items-center gap-3.5">
      <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-state-safe text-paper animate-lock-click">
        <Lock width={24} height={24} />
      </span>
      <div>
        <div className="font-semibold text-ink">Locked &amp; safe</div>
        <div className="text-sm text-muted"><span className="font-mono">{naira(amount)}</span> is held in the isolated order account.</div>
      </div>
    </div>
  );
}

function ConfirmOrDispute({ order, refresh }) {
  const toast = useToast();
  const [mode, setMode] = useState(null); // null | 'dispute'
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = order.deliveryWindowExpiresAt ? order.deliveryWindowExpiresAt - now : 0;

  async function confirm() {
    setBusy(true);
    try {
      const updated = await api.confirm(order.ref);
      await refresh();
      toast(updated.releaseAuthorization?.required ? 'Confirmed — authorizing the payout…' : 'Confirmed — vendor paid', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  async function submitDispute(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const form = new FormData();
      form.append('reason', reason || 'Item not as described');
      if (file) form.append('proof', file);
      const res = await api.dispute(order.ref, form);
      setResult(res);
      await refresh();
      toast('Dispute opened — funds frozen', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  if (result) {
    return (
      <div className="space-y-3">
        <Outcome tone="freeze" icon={Alert} title="Funds frozen — you're protected" body="Your dispute is on record and the vendor has been pinged. The money cannot move until it is resolved." order={order} />
        {result.assessment && <AiVerdict assessment={result.assessment} kind="problem" />}
        {result.comparison && <AiComparison comparison={result.comparison} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-state-review/25 bg-state-review/5 px-4 py-2.5">
        <span className="text-sm font-medium text-ink">Delivered — please confirm</span>
        <span className="font-mono text-sm text-state-review">{countdown(left)} left</span>
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        If the item is correct, confirm to release payment. If there is a problem, tapping “Something’s wrong” freezes
        the money — you are never forced to pay for a bad order. If you do nothing, it auto-releases to the vendor when the timer ends.
      </p>

      {mode !== 'dispute' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={confirm} disabled={busy} className="btn-gold">
            {busy ? <Spinner width={18} height={18} /> : <Check width={18} height={18} />} Confirm received
          </button>
          <button onClick={() => setMode('dispute')} disabled={busy} className="btn-danger">
            <Alert width={18} height={18} /> Something’s wrong
          </button>
        </div>
      ) : (
        <form onSubmit={submitDispute} className="space-y-3 rounded-xl2 border border-line bg-canvas/60 p-4">
          <div>
            <label className="label" htmlFor="reason">What’s the problem?</label>
            <input id="reason" className="input" placeholder="Wrong item / damaged / empty parcel…" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <EvidenceUpload file={file} onFile={setFile} label="Photo of the problem" hint="An unboxing shot works best — AI compares it to the vendor’s dispatch proof." />
          <div className="flex gap-2.5">
            <button type="submit" disabled={busy} className="btn-ink flex-1">
              {busy ? <><Spinner width={18} height={18} /> Submitting…</> : <>Freeze &amp; dispute</>}
            </button>
            <button type="button" onClick={() => setMode(null)} className="btn-ghost">Back</button>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-muted"><Sparkles width={13} height={13} className="text-gold-deep" /> Your photo is timestamped and checked by AI. You can dispute even without a photo.</p>
        </form>
      )}
    </div>
  );
}

function Outcome({ tone, icon: Icon, title, body, order }) {
  const cls = { safe: 'border-state-safe/25 bg-state-safe/5 text-state-safe', freeze: 'border-state-freeze/25 bg-state-freeze/5 text-state-freeze', review: 'border-state-review/25 bg-state-review/5 text-state-review' }[tone];
  const money = order.transactions?.filter((t) => t.status === 'SUCCESS' && t.type !== 'LOCK') || [];
  return (
    <div className={`rounded-xl2 border p-4 ${cls}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-current/10"><Icon width={20} height={20} /></span>
        <div className="font-semibold text-ink">{title}</div>
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink/75">{body}</p>
      {money.map((t) => (
        <div key={t.id} className="mt-2 font-mono text-[11px] text-muted">
          {t.type} · {naira(t.amount)} · ref {t.monnifyReference || '—'}{t.detail?.mode === 'DEMO_COMPLETION' ? ' · (2FA pending)' : ''}
        </div>
      ))}
    </div>
  );
}

function TrustNote({ order }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-2">
        <Shield width={18} height={18} className="text-gold-deep" />
        <span className="text-sm font-semibold text-ink">Why this is safe</span>
      </div>
      <ul className="space-y-2 text-[13px] leading-relaxed text-muted">
        <li className="flex gap-2"><Check width={15} height={15} className="mt-0.5 shrink-0 text-state-safe" /> Your money isn’t in LinkLock’s pocket — it’s in a locked account tagged to <span className="font-mono text-ink">{order.ref}</span>.</li>
        <li className="flex gap-2"><Check width={15} height={15} className="mt-0.5 shrink-0 text-state-safe" /> A problem freezes the funds. A clean reversal returns them to your bank.</li>
        <li className="flex gap-2"><Check width={15} height={15} className="mt-0.5 shrink-0 text-state-safe" /> Backed by {order.accountMode === 'LIVE' ? 'a real Monnify reserved account' : 'Monnify reserved-account architecture'}.</li>
      </ul>
    </div>
  );
}

function Loader() {
  return <div className="flex items-center justify-center py-24 text-muted"><Spinner width={22} height={22} /> <span className="ml-2">Loading order…</span></div>;
}
function Missing({ ref }) {
  return (
    <div className="text-center py-20">
      <Lockmark size={54} className="mx-auto" />
      <h1 className="mt-4 text-xl font-semibold">Order not found</h1>
      <p className="mt-1 text-muted">We couldn’t find <span className="font-mono">{ref}</span>.</p>
      <Link to="/" className="btn-ghost mt-5 inline-flex">Back home</Link>
    </div>
  );
}
