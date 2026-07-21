export function naira(n) {
  const v = Number(n || 0);
  return '₦' + v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function groupAccount(num) {
  if (!num) return '';
  return String(num).replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

const STATE_META = {
  CREATED: { tone: 'idle', label: 'Awaiting payment' },
  LOCKED: { tone: 'safe', label: 'Locked & safe' },
  SHIPPED: { tone: 'safe', label: 'Shipped with proof' },
  DELIVERY_WINDOW: { tone: 'review', label: 'Confirm window open' },
  RELEASED: { tone: 'safe', label: 'Released to vendor' },
  DISPUTED: { tone: 'freeze', label: 'Disputed — frozen' },
  UNDER_REVIEW: { tone: 'review', label: 'Under human review' },
  REVERSED: { tone: 'freeze', label: 'Reversed to buyer' },
  SPLIT: { tone: 'review', label: 'Split resolution' },
};

export function stateMeta(state) {
  return STATE_META[state] || { tone: 'idle', label: state };
}

export function countdown(ms) {
  if (ms <= 0) return 'expired';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function timeAgo(ts) {
  const d = Date.now() - ts;
  const s = Math.floor(d / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}
