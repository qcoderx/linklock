import { Link } from 'react-router-dom';
import { Page } from '../components/Layout.jsx';
import { Lockmark } from '../components/Logo.jsx';

export default function NotFound() {
  return (
    <Page max="max-w-lg">
      <div className="text-center py-20">
        <Lockmark size={56} className="mx-auto" />
        <h1 className="mt-5 text-2xl font-bold text-ink">This link is empty</h1>
        <p className="mt-2 text-muted">The order doesn’t exist, or its link expired. Every real LinkLock link opens a locked, isolated account for one order.</p>
        <Link to="/" className="btn-gold mt-6 inline-flex">Create a locked link</Link>
      </div>
    </Page>
  );
}
