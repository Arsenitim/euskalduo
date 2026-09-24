import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { t } from '../i18n';
import { FeedbackButton } from './components/FeedbackDialog';
import { LearnerProvider, useLearner } from './LearnerContext';
import { HomePage } from './pages/HomePage';
import { MixPage } from './pages/MixPage';
import { PracticePage } from './pages/PracticePage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsPage } from './pages/SettingsPage';
import { WeekPage } from './pages/WeekPage';
import { WeeksPage } from './pages/WeeksPage';

/**
 * Learner routes live in the URL fragment (#/…), which browsers never send
 * to the server, so not even the chosen week reaches the server logs.
 */
export function LearnerApp() {
  return (
    <LearnerProvider>
      <HashRouter>
        <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
          Saltar al contenido
        </a>
        <header className="app-header">
          <Link to="/" className="logo" aria-label={`${t('appName')} — ${t('home')}`}>
            <span className="logo-mark" aria-hidden="true">E</span>
            <span className="logo-text">{t('appName')}</span>
          </Link>
          <nav className="app-nav" aria-label="Principal">
            <NavLink to="/semanas">
              <span aria-hidden="true">📅</span> {t('navWeeks')}
            </NavLink>
            <NavLink to="/progreso">
              <span aria-hidden="true">⭐</span> {t('navProgress')}
            </NavLink>
            <NavLink to="/ajustes">
              <span aria-hidden="true">⚙️</span> {t('navSettings')}
            </NavLink>
            <FeedbackButton />
          </nav>
        </header>
        <main id="main" tabIndex={-1} className="app-main">
          <ContentGate>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/semanas" element={<WeeksPage />} />
              <Route path="/semana/:setId" element={<WeekPage />} />
              <Route path="/mezclar" element={<MixPage />} />
              <Route path="/practicar" element={<PracticePage />} />
              <Route path="/progreso" element={<ProgressPage />} />
              <Route path="/ajustes" element={<SettingsPage />} />
              <Route path="/privacidad" element={<PrivacyPage />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
          </ContentGate>
        </main>
        <footer className="app-footer">
          <Link to="/privacidad">{t('navPrivacy')}</Link>
          <span>{t('progressLocal')}</span>
        </footer>
      </HashRouter>
    </LearnerProvider>
  );
}

function ContentGate({ children }: { children: React.ReactNode }) {
  const { sets, error, reload } = useLearner();
  if (error) {
    return (
      <div className="card center-note" role="alert">
        <p>{t('loadError')}</p>
        <button className="btn" onClick={reload}>
          {t('retry')}
        </button>
      </div>
    );
  }
  if (!sets) return <p className="center-note">{t('loading')}</p>;
  return <>{children}</>;
}
