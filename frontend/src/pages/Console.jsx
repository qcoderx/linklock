import { useEffect, useState, useCallback } from 'react';
import { Page } from '../components/Layout.jsx';
import { StateBadge } from '../components/StateBadge.jsx';
import { AiComparison } from '../components/AiVerdict.jsx';
import { AiVerdict } from '../components/AiVerdict.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/api.js';
import { naira, timeAgo } from '../lib/format.js';
import { Scale, Shield, Spinner, Sparkles, Lock } from '../components/Icons.jsx';

const TOKEN_KEY = 'linklock_admin_token';

export default function Console() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState(token);
  const [queue, setQueue] = useState([]);
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const load = useCallback(async (tok) => {
    setLoading(true);
    try {
      const [q, a] = await Promise.all([api.admin.reviewQueue(tok), api.admin.orders(tok)]);
      setQueue(q); setAll(a); setAuthed(true);
      localStorage.setItem(TOKEN_KEY, tok); setToken(tok);
    } catch (e) {
      setAuthed(false);
      if (e.status === 401) toast('Invalid admin token', 'error'); else toast(e.message, 'error');
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { if (token) load(token); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => load(token), 5000);
    return () => clearInterval(t);
  }, [authed, token, load]);

  if (!authed) {
    return (
      <Page max="max-w-md">
        <div className="card p-6 mt-10">
          <div className="flex items-center gap-2 mb-1"><Shield width={20} height={20} className="text-gold-deep" /><h1 className="text-lg font-bold">Review console</h1></div>
          <p className="text-sm text-muted mb-4">Internal only. Enter the admin token to review frozen cases.</p>
          <form onSubmit={(e) => { e.preventDefault(); load(input); }} className="space-y-3">
            <input className="input font-mono" type="password" placeholder="ADMIN_TOKEN" value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="btn-gold w-full" disabled={loading}>{loading ? <Spinner width={18} height={18} /> : <Lock width={18} height={18} />} Unlock console</button>
          </form>
          <p className="mt-3 text-[11px] text-muted font-mono">dev default: linklock-admin-dev</p>
        </div>
      </Page>
    );
  }

  const stats = summarize(all);
  return (
    <Page>
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="eyebrow">Internal</div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2"><Scale width={24} height={24} className="text-gold-deep" /> Review console</h1>
        </div>
        <button onClick={() => { localStorage.removeItem(TOKEN_KEY); setAuthed(false); }} className="text-xs text-muted hover:text-ink cursor-pointer">Lock</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Stat label="Total orders" value={stats.total} />
        <Stat label="Locked" value={stats.locked} tone="safe" />
        <Stat label="In window" value={stats.window} tone="review" />
        <Stat label="Frozen / review" value={stats.frozen} tone="freeze" />
        <Stat label="Released" value={stats.released} tone="safe" />
      </div>

      <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">Review queue <span className="font-mono text-xs text-muted">({queue.length})</span></h2>
      {queue.length === 0 ? (
        <div className="card p-8 text-center text-muted text-sm">No frozen cases. Honest deals are flowing. ✦</div>
      ) : (
        <div className="space-y-4">{queue.map((o) => <ReviewCard key={o.id} order={o} token={token} onDone={() => load(token)} />)}</div>
      )}

      <h2 className="text-sm font-semibold text-ink mt-8 mb-3">All orders</h2>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted border-b border-line">
              <th className="font-medium font-mono text-xs uppercase tracking-wide px-4 py-2.5">Order</th>
              <th className="font-medium font-mono text-xs uppercase tracking-wide px-4 py-2.5">Item</th>
              <th className="font-medium font-mono text-xs uppercase tracking-wide px-4 py-2.5">Amount</th>
              <th className="font-medium font-mono text-xs uppercase tracking-wide px-4 py-2.5">State</th>
              <th className="font-medium font-mono text-xs uppercase tracking-wide px-4 py-2.5">Mode</th>
              <th className="font-medium font-mono text-xs uppercase tracking-wide px-4 py-2.5">Age</th>
            </tr></thead>
            <tbody>
              {all.map((o) => (
                <tr key={o.id} className="border-b border-line/60 last:border-0 hover:bg-canvas/70">
                  <td className="px-4 py-2.5 font-mono text-xs">{o.ref}</td>
                  <td className="px-4 py-2.5 max-w-[200px] truncate">{o.itemDescription}</td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">{naira(o.amount)}</td>
                  <td className="px-4 py-2.5"><StateBadge state={o.state} size="sm" /></td>
                  <td className="px-4 py-2.5"><span className={`font-mono text-[11px] ${o.accountMode === 'LIVE' ? 'text-state-safe' : 'text-muted'}`}>{o.accountMode}</span></td>
                  <td className="px-4 py-2.5 text-muted text-xs">{timeAgo(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Page>
  );
}

function ReviewCard({ order, token, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const buyerEv = order.evidence?.find((e) => e.side === 'BUYER');
  const vendorEv = order.evidence?.find((e) => e.side === 'VENDOR');

  async function resolve(decision) {
    if (order.state !== 'UNDER_REVIEW') return toast('Vendor must contest before a case can be resolved here', 'error');
    setBusy(decision);
    try { await api.admin.resolve(token, order.ref, decision, note); toast(`Resolved: ${decision}`, 'success'); onDone(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  }
  async function recompare() {
    setBusy('recompare');
    try { await api.admin.recompare(token, order.ref); toast('AI comparison refreshed', 'success'); onDone(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <div className="font-semibold text-ink">{order.itemDescription}</div>
          <div className="font-mono text-xs text-muted">{order.ref} · {naira(order.amount)} · opened {order.dispute ? timeAgo(order.dispute.createdAt) : ''}</div>
        </div>
        <StateBadge state={order.state} size="sm" />
      </div>

      {order.dispute?.reason && <div className="mb-3 rounded-lg bg-canvas border border-line px-3.5 py-2 text-sm"><span className="text-muted">Buyer says:</span> <span className="text-ink">“{order.dispute.reason}”</span> {order.dispute.vendorResponse && <span className="font-mono text-xs text-muted"> · vendor: {order.dispute.vendorResponse}</span>}</div>}

      <div className="grid sm:grid-cols-2 gap-4 mb-3">
        <EvidenceCol label="Vendor dispatch proof" ev={vendorEv} kind="dispatch" />
        <EvidenceCol label="Buyer problem proof" ev={buyerEv} kind="problem" />
      </div>

      {order.dispute?.aiComparison && <div className="mb-3"><AiComparison comparison={order.dispute.aiComparison} /></div>}

      {order.state === 'UNDER_REVIEW' ? (
        <>
          <input className="input mb-3" placeholder="Resolution note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2.5">
            <button onClick={() => resolve('RELEASE')} disabled={!!busy} className="btn-gold flex-1 min-w-[130px]">{busy === 'RELEASE' ? <Spinner width={16} height={16} /> : null} Release to vendor</button>
            <button onClick={() => resolve('REVERSE')} disabled={!!busy} className="btn-ink flex-1 min-w-[130px]">{busy === 'REVERSE' ? <Spinner width={16} height={16} /> : null} Reverse to buyer</button>
            <button onClick={() => resolve('SPLIT')} disabled={!!busy} className="btn-ghost flex-1 min-w-[110px]">{busy === 'SPLIT' ? <Spinner width={16} height={16} /> : <Scale width={16} height={16} />} Split</button>
            {vendorEv && buyerEv && <button onClick={recompare} disabled={!!busy} className="btn-ghost" title="Re-run AI comparison"><Sparkles width={16} height={16} /></button>}
          </div>
        </>
      ) : (
        <div className="rounded-lg bg-state-freeze/5 border border-state-freeze/20 px-3.5 py-2.5 text-sm text-ink flex items-center gap-2">
          <Lock width={15} height={15} className="text-state-freeze" /> Frozen — awaiting the vendor’s response (accept or contest). No money can move.
        </div>
      )}
    </div>
  );
}

function EvidenceCol({ label, ev, kind }) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      {ev ? (
        <>
          <img src={ev.url} alt={label} className="w-full h-40 object-cover rounded-lg border border-line" />
          {ev.aiAssessment && <div className="mt-2"><AiVerdict assessment={ev.aiAssessment} kind={kind} /></div>}
        </>
      ) : (
        <div className="h-40 rounded-lg border border-dashed border-line flex items-center justify-center text-xs text-muted">No proof submitted</div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'idle' }) {
  const c = { safe: 'text-state-safe', freeze: 'text-state-freeze', review: 'text-state-review', idle: 'text-ink' }[tone];
  return (
    <div className="card p-3.5">
      <div className={`font-mono text-2xl font-bold tabular-nums ${c}`}>{value}</div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}

function summarize(orders) {
  const c = (s) => orders.filter((o) => o.state === s).length;
  return {
    total: orders.length,
    locked: c('LOCKED') + c('SHIPPED'),
    window: c('DELIVERY_WINDOW'),
    frozen: c('DISPUTED') + c('UNDER_REVIEW'),
    released: c('RELEASED') + c('SPLIT'),
  };
}
