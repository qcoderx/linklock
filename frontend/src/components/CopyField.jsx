import { useState } from 'react';
import { Copy, Check } from './Icons.jsx';
import { useToast } from './Toast.jsx';

export function CopyField({ label, value, display, mono = true, big = false }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast('Copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast('Could not copy — long-press to select', 'error');
    }
  }

  return (
    <div>
      {label && <div className="eyebrow mb-1.5">{label}</div>}
      <button
        type="button"
        onClick={copy}
        className="group w-full flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-3 text-left transition-colors hover:border-gold-deep hover:bg-gold-soft/40 cursor-pointer"
      >
        <span className={`${mono ? 'font-mono' : 'font-sans'} ${big ? 'text-2xl sm:text-3xl' : 'text-base'} font-semibold text-ink tabular-nums tracking-tight truncate`}>
          {display ?? value}
        </span>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-muted group-hover:text-gold-deep">
          {copied ? <Check width={16} height={16} /> : <Copy width={16} height={16} />}
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>
    </div>
  );
}
