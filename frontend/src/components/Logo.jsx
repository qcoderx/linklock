// The LinkLock mark: a padlock whose shackle is an interlocking chat-chain link.
export function Lockmark({ size = 40, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <rect x="1" y="1" width="46" height="46" rx="12" fill="#14130F" />
      <rect x="1" y="1" width="46" height="46" rx="12" fill="url(#ll_sheen)" fillOpacity="0.12" />
      {/* interlocking link shackle */}
      <path d="M18 20v-3.5a6 6 0 0 1 12 0V20" stroke="#F5B301" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M24 12.5a6 6 0 0 0-6 6" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" opacity="0.9" />
      {/* lock body */}
      <rect x="12" y="20" width="24" height="17" rx="4.5" fill="#F5B301" />
      <rect x="12" y="20" width="24" height="17" rx="4.5" fill="url(#ll_body)" fillOpacity="0.5" />
      <circle cx="24" cy="27.5" r="2.7" fill="#14130F" />
      <rect x="22.8" y="28.6" width="2.4" height="5" rx="1.2" fill="#14130F" />
      <defs>
        <linearGradient id="ll_sheen" x1="0" y1="0" x2="48" y2="48"><stop stopColor="#F5B301" /><stop offset="1" stopColor="#F5B301" stopOpacity="0" /></linearGradient>
        <linearGradient id="ll_body" x1="12" y1="20" x2="36" y2="37"><stop stopColor="#FFFFFF" /><stop offset="1" stopColor="#F5B301" stopOpacity="0" /></linearGradient>
      </defs>
    </svg>
  );
}

export function Wordmark({ className = '', size = 40, showMark = true, sub = false }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {showMark && <Lockmark size={size} />}
      <div className="leading-none">
        <div className="font-bold tracking-tight text-ink" style={{ fontSize: size * 0.5 }}>
          Link<span className="text-gold-deep">Lock</span>
        </div>
        {sub && <div className="eyebrow mt-1">Escrow · never held</div>}
      </div>
    </div>
  );
}
