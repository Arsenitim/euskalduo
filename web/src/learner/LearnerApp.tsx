import { HashRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { t } from '../i18n';
import { VoiceLifecycle } from './components/Voice';
import { FeedbackButton } from './components/FeedbackDialog';
import { OfflinePill } from './components/Offline';
import { LearnerProvider, useLearner } from './LearnerContext';
import { CollectionPage } from './pages/CollectionPage';
import { ExamPage } from './pages/ExamPage';
import { HomePage } from './pages/HomePage';
import { ListenPage } from './pages/ListenPage';
import { PracticePage } from './pages/PracticePage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsPage } from './pages/SettingsPage';
import { StoryPage } from './pages/StoryPage';
import { TopicsPage } from './pages/TopicsPage';
import { LESSON_PATH, legacyRedirect } from './routes';

/**
 * Learner routes live in the URL fragment (#/…), which browsers never send
 * to the server, so not even the chosen topic or story reaches the server logs.
 */
export function LearnerApp() {
  return (
    <LearnerProvider>
      <HashRouter>
        <VoiceLifecycle />
        <Shell />
      </HashRouter>
    </LearnerProvider>
  );
}

/** Lessons get the whole screen: no site menu or footer, so the answers and "Siguiente" fit on a phone. */
function isLessonPath(pathname: string): boolean {
  return pathname === LESSON_PATH || pathname === '/practicar';
}

function Shell() {
  const location = useLocation();
  const lesson = isLessonPath(location.pathname);
  return (
    <div className={lesson ? 'shell shell-lesson' : 'shell'}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Saltar al contenido
      </a>
      {!lesson && (
        <header className="app-header">
          <div className="header-brand">
            <Link to="/" className="logo" aria-label={`${t('appName')} — ${t('home')}`}>
              <span className="logo-mark" aria-hidden="true">E</span>
              <span className="logo-text">{t('appName')}</span>
            </Link>
            <OfflinePill />
          </div>
          <nav className="app-nav" aria-label="Principal">
            <NavLink to="/temas">
              <span aria-hidden="true">🧩</span> {t('navTopics')}
            </NavLink>
            <NavLink to="/escuchar">
              <span aria-hidden="true">🎧</span> {t('navListen')}
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
      )}
      <main id="main" tabIndex={-1} className="app-main">
        <ContentGate>
          <LegacyRedirect />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/leccion" element={<LessonRoute />} />
            <Route path="/temas" element={<TopicsPage />} />
            <Route path="/tema/:setId" element={<CollectionPage />} />
            <Route path="/escuchar" element={<ListenPage />} />
            <Route path="/escuchar/:storyId" element={<StoryPage />} />
            <Route path="/examen/:examId" element={<ExamPage />} />
            <Route path="/practicar" element={<PracticeRoute />} />
            <Route path="/progreso" element={<ProgressPage />} />
            <Route path="/ajustes" element={<SettingsPage />} />
            <Route path="/privacidad" element={<PrivacyPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </ContentGate>
      </main>
      {!lesson && (
        <footer className="app-footer">
          <Link to="/privacidad">{t('navPrivacy')}</Link>
          <span>{t('progressLocal')}</span>
          <small className="voice-credit">
            <a href="https://huggingface.co/itzune/maider-tts" target="_blank" rel="noopener noreferrer">
              {t('voiceCredit')}
            </a>
          </small>
        </footer>
      )}
    </div>
  );
}

/** Old week-era links (#/semanas, #/mezclar, …) lead to their new pages. */
function LegacyRedirect() {
  const location = useLocation();
  const target = legacyRedirect(location.pathname, location.search);
  return target ? <Navigate to={target} replace /> : null;
}

/** A fresh lesson each time the route is entered. */
function LessonRoute() {
  const location = useLocation();
  return <PracticePage key={location.key} lesson />;
}

function PracticeRoute() {
  const location = useLocation();
  return <PracticePage key={location.key + location.search} />;
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
