import { Bell } from './Icons.jsx';
import { timeAgo } from '../lib/format.js';

// The chat messages LinkLock delivers (safe-to-ship, said-No ping, confirm link…).
export function MessageFeed({ messages, audience }) {
  const list = audience ? messages.filter((m) => m.audience === audience) : messages;
  if (!list.length) return null;
  return (
    <div className="space-y-2.5">
      {list.map((m) => (
        <div key={m.id} className="flex gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-gold">
            <Bell width={14} height={14} />
          </span>
          <div className="min-w-0">
            <div className="rounded-xl rounded-tl-sm bg-canvas border border-line px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
              {m.body}
            </div>
            <div className="mt-1 flex items-center gap-2 pl-1">
              <span className="eyebrow">to {m.audience.toLowerCase()}</span>
              <span className="text-[11px] text-muted">· {timeAgo(m.createdAt)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
