import { Sparkles, Check, Alert, Scale } from './Icons.jsx';

function Chip({ ok, children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-mono font-medium border
      ${ok ? 'bg-state-safe/10 text-state-safe border-state-safe/20' : 'bg-state-freeze/10 text-state-freeze border-state-freeze/20'}`}>
      {ok ? <Check width={12} height={12} /> : <Alert width={12} height={12} />}
      {children}
    </span>
  );
}

function Confidence({ value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-ink/10 overflow-hidden">
        <div className="h-full rounded-full bg-gold-deep" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-muted">{pct}%</span>
    </div>
  );
}

// Renders a vendor/buyer proof assessment.
export function AiVerdict({ assessment, kind = 'dispatch' }) {
  if (!assessment) return null;
  if (assessment.available === false) {
    return (
      <div className="rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm text-muted flex items-center gap-2">
        <Sparkles width={16} height={16} className="text-muted" />
        AI check unavailable — evidence is still on record. <span className="font-mono text-xs">({assessment.reason})</span>
      </div>
    );
  }
  const strong = kind === 'dispatch' ? assessment.passed : (assessment.genuine && assessment.problemVisible);
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${strong ? 'border-state-safe/25 bg-state-safe/5' : 'border-state-freeze/25 bg-state-freeze/5'}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wide text-ink">
          <Sparkles width={15} height={15} className="text-gold-deep" /> AI verification
        </div>
        <Confidence value={assessment.confidence} />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <Chip ok={assessment.genuine}>{assessment.genuine ? 'genuine' : 'not genuine'}</Chip>
        <Chip ok={assessment.matchesOrder}>{assessment.matchesOrder ? 'matches order' : 'no match'}</Chip>
        {kind === 'dispatch' && <Chip ok={!assessment.reusedOrStockImage}>{assessment.reusedOrStockImage ? 'stock/reused' : 'fresh capture'}</Chip>}
        {kind === 'problem' && 'problemVisible' in assessment && <Chip ok={assessment.problemVisible}>{assessment.problemVisible ? 'problem visible' : 'problem not visible'}</Chip>}
        {assessment.tampering && <Chip ok={false}>tampering</Chip>}
      </div>
      {assessment.notes && <p className="text-[13px] leading-relaxed text-ink/80">{assessment.notes}</p>}
    </div>
  );
}

// Renders the dispatch-vs-delivered comparison used in disputes.
export function AiComparison({ comparison }) {
  if (!comparison) return null;
  if (comparison.available === false) {
    return (
      <div className="rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm text-muted">
        AI comparison unavailable — <span className="font-mono text-xs">{comparison.reason}</span>
      </div>
    );
  }
  const match = comparison.dispatchVsDelivered === 'MATCH';
  const mismatch = comparison.dispatchVsDelivered === 'MISMATCH';
  const tone = mismatch ? 'freeze' : match ? 'safe' : 'review';
  const cls = { safe: 'border-state-safe/25 bg-state-safe/5', freeze: 'border-state-freeze/25 bg-state-freeze/5', review: 'border-state-review/25 bg-state-review/5' }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3.5 ${cls}`}>
      <div className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wide text-ink mb-2">
        <Scale width={15} height={15} className="text-gold-deep" /> Dispatch vs delivered
      </div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className={`font-mono text-lg font-semibold ${mismatch ? 'text-state-freeze' : match ? 'text-state-safe' : 'text-state-review'}`}>
          {comparison.dispatchVsDelivered}
        </span>
        <span className="font-mono text-xs text-muted">conf {Math.round((comparison.confidence || 0) * 100)}%</span>
      </div>
      {comparison.notes && <p className="text-[13px] leading-relaxed text-ink/80 mb-1.5">{comparison.notes}</p>}
      <div className="text-xs text-muted">AI suggests: <span className="font-mono font-medium text-ink">{comparison.recommendation}</span> — a reviewer decides.</div>
    </div>
  );
}
