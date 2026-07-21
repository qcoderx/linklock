import { stateMeta } from '../lib/format.js';
import { Lock, LockOpen, Check, Alert, Scale, Truck } from './Icons.jsx';

const TONE = {
  safe: 'bg-state-safe/10 text-state-safe border-state-safe/20',
  freeze: 'bg-state-freeze/10 text-state-freeze border-state-freeze/20',
  review: 'bg-state-review/10 text-state-review border-state-review/20',
  idle: 'bg-ink/5 text-muted border-line',
};

const ICON = {
  CREATED: LockOpen, LOCKED: Lock, SHIPPED: Truck, DELIVERY_WINDOW: Truck,
  RELEASED: Check, DISPUTED: Alert, UNDER_REVIEW: Scale, REVERSED: LockOpen, SPLIT: Scale,
};

export function StateBadge({ state, size = 'md' }) {
  const meta = stateMeta(state);
  const Icon = ICON[state] || Lock;
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-mono font-medium uppercase tracking-wide ${pad} ${TONE[meta.tone]}`}>
      <Icon width={size === 'sm' ? 13 : 15} height={size === 'sm' ? 13 : 15} />
      {meta.label}
    </span>
  );
}
