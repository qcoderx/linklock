import { Link, useLocation } from 'react-router-dom';
import { Wordmark } from './Logo.jsx';
import { Shield } from './Icons.jsx';

export function Header() {
  const { pathname } = useLocation();
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="cursor-pointer" aria-label="LinkLock home">
          <Wordmark size={34} />
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-muted">
            <Shield width={15} height={15} className="text-gold-deep" />
            Non-custodial · Powered by Monnify
          </span>
          {pathname !== '/console' && (
            <Link to="/console" className="text-xs font-medium text-muted hover:text-ink transition-colors cursor-pointer">
              Review console
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line/70">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted">
        <Wordmark size={26} sub />
        <p className="text-center sm:text-right max-w-md">
          Escrow at the speed of a transfer. Zero signup. Money sits in an isolated per-order
          account — <span className="text-ink font-medium">we never hold it</span>.
        </p>
      </div>
    </footer>
  );
}

export function Page({ children, max = 'max-w-5xl' }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className={`flex-1 w-full mx-auto ${max} px-4 sm:px-6 py-8 sm:py-10`}>{children}</main>
      <Footer />
    </div>
  );
}
