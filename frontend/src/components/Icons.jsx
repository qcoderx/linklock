// Consistent 24x24 stroke icons (no emoji in UI chrome).
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const Lock = (p) => (
  <svg {...base} {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /><circle cx="12" cy="15" r="1.3" /></svg>
);
export const LockOpen = (p) => (
  <svg {...base} {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 7.5-1.9" /><circle cx="12" cy="15" r="1.3" /></svg>
);
export const Shield = (p) => (
  <svg {...base} {...p}><path d="M12 3l7 2.5v5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5v-5L12 3z" /><path d="M9 12l2 2 4-4" /></svg>
);
export const Check = (p) => (<svg {...base} {...p}><path d="M4.5 12.5l4.5 4.5 10.5-11" /></svg>);
export const Copy = (p) => (<svg {...base} {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" /></svg>);
export const Upload = (p) => (<svg {...base} {...p}><path d="M12 15V4" /><path d="M8 8l4-4 4 4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>);
export const Alert = (p) => (<svg {...base} {...p}><path d="M12 4l9 16H3l9-16z" /><path d="M12 10v4" /><path d="M12 17.5v.5" /></svg>);
export const Sparkles = (p) => (<svg {...base} {...p}><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4z" /><path d="M18 15l.7 1.8L20.5 17l-1.8.7L18 19.5l-.7-1.8L15.5 17l1.8-.5L18 15z" /></svg>);
export const Link = (p) => (<svg {...base} {...p}><path d="M9 15l6-6" /><path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1" /><path d="M13 18l-1 1a4 4 0 0 1-6-6l1-1" /></svg>);
export const Truck = (p) => (<svg {...base} {...p}><rect x="2.5" y="7" width="11" height="9" rx="1.5" /><path d="M13.5 10h4l3 3v3h-7" /><circle cx="6.5" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></svg>);
export const Scale = (p) => (<svg {...base} {...p}><path d="M12 4v16" /><path d="M6 20h12" /><path d="M4 8h16" /><path d="M4 8l-2 5a3 3 0 0 0 6 0L6 8" opacity=".85" /><path d="M18 8l-2 5a3 3 0 0 0 6 0l-2-5" opacity=".85" /></svg>);
export const Spinner = (p) => (
  <svg {...base} {...p} className={`animate-spin ${p.className || ''}`}><path d="M12 3a9 9 0 1 0 9 9" /></svg>
);
export const Arrow = (p) => (<svg {...base} {...p}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>);
export const Bell = (p) => (<svg {...base} {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>);
export const Camera = (p) => (<svg {...base} {...p}><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.3" /></svg>);
