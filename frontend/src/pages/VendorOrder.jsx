import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Page } from '../components/Layout.jsx';
import { Lockmark } from '../components/Logo.jsx';
import { CopyField } from '../components/CopyField.jsx';
import { StatusRail } from '../components/StatusRail.jsx';
import { StateBadge } from '../components/StateBadge.jsx';
import { AiVerdict, AiComparison } from '../components/AiVerdict.jsx';
import { EvidenceUpload } from '../components/EvidenceUpload.jsx';
import { MessageFeed } from '../components/MessageFeed.jsx';
import { useToast } from '../components/Toast.jsx';
import { useOrder } from '../hooks/useOrder.js';
import { api } from '../lib/api.js';
import { naira, groupAccount, countdown } from '../lib/format.js';
import { Lock, Truck, Check, Alert, Shield, Spinner, Sparkles } from '../components/Icons.jsx';

export default function VendorOrder() {
  const { ref } = useParams();
  const { order, loading, error, refresh } = useOrder(ref);

  if (loading) return <Page><div className="flex items-center justify-center py-24 text-muted"><Spinner width={22} height={22} /><span className="ml-2">Loading…</span></div></Page>;
  if (error || !order) return <Page><div className="text-center py-20"><Lockmark size={54} className="mx-auto" /><h1 className="mt-4 text-xl font-semibold">Order not found</h1><Link to="/" className="btn-ghost mt-5 inline-flex">Back home</Link></div></Page>;

  return (
    <Page max="max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="eyebrow">Vendor console</div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2.5 mt-1">
            {order.itemDescription}
          </h1>
          <p className="text-sm text-muted font-mono mt-0.5">{order.ref} · {naira(order.amount)}</p>
        </div>
        <StateBadge state={order.state} />
      </div>

      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6 lg:gap-8 items-start">
        <div className="space-y-5">
          <VendorAction order={order} refresh={refresh} />
        </div>
        <aside className="space-y-5">
          <div className="card p-5"><div className="eyebrow mb-3">Escrow status</div><StatusRail state={order.state} /></div>
          {order.messages?.some((m) => m.audience === 'VENDOR') && (
            <div className="card p-5">
              <div className="eyebrow mb-3">Your notifications</div>
              <MessageFeed messages={order.messages} audience="VENDOR" />
            </div>
          )}
        </aside>
      </div>
    </Page>
  );
}

function VendorAction({ order, refresh }) {
  if (order.state === 'CREATED') return <AwaitingPayment order={order} />;
  if (order.state === 'LOCKED') return <ShipAndProve order={order} refresh={refresh} />;
  if (order.state === 'SHIPPED') return <MarkDelivered order={order} refresh={refresh} />;
  if (order.state === 'DELIVERY_WINDOW') return <AwaitingConfirm order={order} />;
  if (order.state === 'DISPUTED') return <RespondToDispute order={order} refresh={refresh} />;
  if (order.state === 'UNDER_REVIEW') return <UnderReview order={order} />;
  return <Terminal order={order} />;
}

function Panel({ children, tone = 'plain' }) {
  const cls = { plain: 'card', gold: 'rounded-xl2 border border-gold/40 bg-gold-soft/40', safe: 'rounded-xl2 border border-state-safe/25 bg-state-safe/5', freeze: 'rounded-xl2 border border-state-freeze/25 bg-state-freeze/5' }[tone];
  return <div className={`${cls} p-5 sm:p-6 animate-rise`}>{children}</div>;
}

function AwaitingPayment({ order }) {
  const origin = window.location.origin;
  return (
    <Panel>
      <div className="flex items-center gap-2 mb-1"><Lock width={18} height={18} className="text-muted" /><h2 className="font-semibold text-ink">Waiting for the buyer to pay</h2></div>
      <p className="text-sm text-muted mb-4">Share the buyer link. You’ll be told the second the money is locked — then you ship.</p>
      <CopyField label="Buyer link — drop in the chat" value={`${origin}/o/${order.ref}`} />
      <div className="mt-4 rounded-xl border border-line bg-canvas px-4 py-3">
        <div className="eyebrow mb-1">Isolated account for this order</div>
        <div className="font-mono text-ink">{groupAccount(order.virtualAccount.accountNumber)} · {order.virtualAccount.bankName}</div>
      </div>
    </Panel>
  );
}

function ShipAndProve({ order, refresh }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [dispatchRef, setDispatchRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [flag, setFlag] = useState(null); // assessment that blocked progress

  async function submit(acknowledge = false) {
    if (!file) return toast('Add a photo of the sealed item', 'error');
    setBusy(true);
    try {
      const form = new FormData();
      form.append('dispatchReference', dispatchRef);
      form.append('proof', file);
      if (acknowledge) form.append('acknowledgeFlag', 'true');
      await api.ship(order.ref, form);
      await refresh();
      toast('Shipped — proof on record', 'success');
    } catch (e) {
      if (e.status === 422 && e.data?.assessment) {
        setFlag(e.data.assessment);
        toast('AI flagged this proof', 'error');
      } else toast(e.message, 'error');
    } finally { setBusy(false); }
  }

  return (
    <Panel tone="gold">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-state-safe text-paper"><Check width={18} height={18} /></span>
        <div><h2 className="font-semibold text-ink">Safe to ship</h2><p className="text-xs text-muted"><span className="font-mono">{naira(order.amountPaid || order.amount)}</span> is locked in the isolated account.</p></div>
      </div>
      <p className="text-[13px] leading-relaxed text-muted my-3">
        Upload a photo of the actual sealed item as you dispatch it. It’s timestamped and put on record — your protection
        if the buyer later disputes. AI checks it’s genuine before the order can progress.
      </p>
      <div className="space-y-3">
        <EvidenceUpload file={file} onFile={(f) => { setFile(f); setFlag(null); }} label="Photo of the sealed item" hint="Show the packaging / parcel too, so it can’t be swapped later." />
        <div>
          <label className="label" htmlFor="dref">Dispatch reference <span className="text-muted font-normal">(courier tracking, optional)</span></label>
          <input id="dref" className="input font-mono" placeholder="DHL-99823" value={dispatchRef} onChange={(e) => setDispatchRef(e.target.value)} />
        </div>
        {flag && (
          <div className="space-y-2.5">
            <AiVerdict assessment={flag} kind="dispatch" />
            <div className="flex gap-2.5">
              <button onClick={() => setFile(null)} className="btn-ghost flex-1">Re-upload genuine proof</button>
              <button onClick={() => submit(true)} disabled={busy} className="btn-danger flex-1" title="Override the AI flag (recorded)">Submit anyway</button>
            </div>
          </div>
        )}
        {!flag && (
          <button onClick={() => submit(false)} disabled={busy || !file} className="btn-gold w-full">
            {busy ? <><Spinner width={18} height={18} /> Verifying proof…</> : <><Truck width={18} height={18} /> Mark shipped with proof</>}
          </button>
        )}
      </div>
    </Panel>
  );
}

function MarkDelivered({ order, refresh }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const vendorEv = order.evidence?.find((e) => e.side === 'VENDOR');
  async function deliver() {
    setBusy(true);
    try { await api.deliver(order.ref); await refresh(); toast('Delivery reported — buyer’s confirm window is open', 'success'); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  return (
    <Panel tone="safe">
      <div className="flex items-center gap-2 mb-1"><Truck width={18} height={18} className="text-state-safe" /><h2 className="font-semibold text-ink">Shipped with verified proof</h2></div>
      <p className="text-sm text-muted mb-3">When the item reaches the buyer, report delivery to open their confirmation window. If they go silent, funds auto-release to you.</p>
      {vendorEv && (
        <div className="mb-3">
          <img src={vendorEv.url} alt="Your dispatch proof" className="max-h-40 rounded-lg border border-line object-contain" />
          {vendorEv.aiAssessment && <div className="mt-2"><AiVerdict assessment={vendorEv.aiAssessment} kind="dispatch" /></div>}
        </div>
      )}
      <button onClick={deliver} disabled={busy} className="btn-gold w-full">{busy ? <Spinner width={18} height={18} /> : <Check width={18} height={18} />} Report delivered</button>
    </Panel>
  );
}

function AwaitingConfirm({ order }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = order.deliveryWindowExpiresAt ? order.deliveryWindowExpiresAt - now : 0;
  return (
    <Panel>
      <div className="flex items-center gap-2 mb-1"><Shield width={18} height={18} className="text-gold-deep" /><h2 className="font-semibold text-ink">Waiting on the buyer</h2></div>
      <p className="text-sm text-muted mb-3">The buyer can confirm to pay you instantly. If they do nothing, the funds auto-release to you when the window ends.</p>
      <div className="flex items-center justify-between rounded-xl border border-state-review/25 bg-state-review/5 px-4 py-3">
        <span className="text-sm font-medium text-ink">Auto-release in</span>
        <span className="font-mono text-lg text-state-review">{countdown(left)}</span>
      </div>
      <p className="mt-2 text-[11px] text-muted">Silence favours the honest vendor — this is why LinkLock never deadlocks.</p>
    </Panel>
  );
}

function RespondToDispute({ order, refresh }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const buyerEv = order.evidence?.find((e) => e.side === 'BUYER');
  const vendorEv = order.evidence?.find((e) => e.side === 'VENDOR');

  async function respond(response) {
    setBusy(true);
    try {
      await api.vendorResponse(order.ref, response);
      await refresh();
      toast(response === 'ACCEPT' ? 'Refund issued to buyer' : 'Contested — escalated to review', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  return (
    <Panel tone="freeze">
      <div className="flex items-center gap-2 mb-1"><Alert width={18} height={18} className="text-state-freeze" /><h2 className="font-semibold text-ink">The customer said No</h2></div>
      <p className="text-sm text-muted mb-3">Reason: <span className="text-ink">“{order.dispute?.reason}”</span>. Funds are frozen — nobody can move them. Accept to refund, or contest if you shipped correctly.</p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {vendorEv && <Evidence label="Your dispatch proof" ev={vendorEv} kind="dispatch" />}
        {buyerEv && <Evidence label="Buyer’s problem proof" ev={buyerEv} kind="problem" />}
      </div>
      {order.dispute?.aiComparison && <div className="mb-4"><AiComparison comparison={order.dispute.aiComparison} /></div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button onClick={() => respond('ACCEPT')} disabled={busy} className="btn-ghost">Accept &amp; refund buyer</button>
        <button onClick={() => respond('CONTEST')} disabled={busy} className="btn-ink">{busy ? <Spinner width={18} height={18} /> : <Shield width={18} height={18} />} Contest (I shipped it)</button>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><Sparkles width={13} height={13} className="text-gold-deep" /> Contesting escalates to a human reviewer with the AI evidence summary. Neither side can force the money.</p>
    </Panel>
  );
}

function Evidence({ label, ev, kind }) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      <img src={ev.url} alt={label} className="w-full h-32 object-cover rounded-lg border border-line" />
      {ev.aiAssessment && <div className="mt-1.5"><AiVerdict assessment={ev.aiAssessment} kind={kind} /></div>}
    </div>
  );
}

function UnderReview({ order }) {
  return (
    <Panel tone="freeze">
      <div className="flex items-center gap-2 mb-1"><Alert width={18} height={18} className="text-state-review" /><h2 className="font-semibold text-ink">Under human review</h2></div>
      <p className="text-sm text-muted">You contested the dispute. A reviewer is deciding with both sides’ evidence and the AI summary. The funds stay frozen — safe — until then.</p>
      {order.dispute?.aiComparison && <div className="mt-3"><AiComparison comparison={order.dispute.aiComparison} /></div>}
    </Panel>
  );
}

function Terminal({ order }) {
  const released = order.state === 'RELEASED';
  const money = order.transactions?.filter((t) => t.status === 'SUCCESS' && t.type !== 'LOCK') || [];
  return (
    <Panel tone={released ? 'safe' : 'freeze'}>
      <div className="flex items-center gap-2.5 mb-1">
        <span className={`flex h-10 w-10 items-center justify-center rounded-full ${released ? 'bg-state-safe' : 'bg-state-freeze'} text-paper`}><Check width={20} height={20} /></span>
        <h2 className="font-semibold text-ink">{released ? 'Paid out to your account' : order.state === 'SPLIT' ? 'Split resolution' : 'Reversed to the buyer'}</h2>
      </div>
      <p className="text-sm text-muted mt-1">
        {released ? 'The vault disbursed the funds to your bank account.' : order.state === 'SPLIT' ? 'The reviewer split the funds based on the evidence.' : 'The dispute resolved in the buyer’s favour and the funds were returned.'}
      </p>
      {money.map((t) => (
        <div key={t.id} className="mt-2 font-mono text-[11px] text-muted">{t.type} · {naira(t.amount)} · ref {t.monnifyReference || '—'}{t.detail?.mode === 'DEMO_COMPLETION' ? ' · (Monnify accepted; 2FA authorization pending)' : ''}</div>
      ))}
    </Panel>
  );
}
