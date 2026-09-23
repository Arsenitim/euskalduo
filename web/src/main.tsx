import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { LearnerApp } from './learner/LearnerApp';
import './styles.css';

// The admin UI is a separate lazily-loaded chunk; learners never download it.
const AdminApp = lazy(() => import('./admin/AdminApp'));

const isAdmin = window.location.pathname.startsWith('/admin');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? (
      <Suspense fallback={<p className="center-note">Loading…</p>}>
        <AdminApp />
      </Suspense>
    ) : (
      <LearnerApp />
    )}
  </StrictMode>,
);
