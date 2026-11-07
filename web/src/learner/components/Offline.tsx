import { useCallback, useEffect, useMemo, useState } from 'react';
import { downloadForOffline, mediaUrls, offlineStatus, offlineSupported, type OfflineStatus } from '../../api/offline';
import { t } from '../../i18n';
import { useLearner } from '../LearnerContext';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <p className="offline-banner" role="status">
      <span aria-hidden="true">✈️</span> {t('offlineBanner')}
    </p>
  );
}

/** iPhone/iPad Safari clears site data after ~7 days unused, unless the app is on the home screen. */
function needsHomeScreen(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  return ios && !standalone;
}

const savedFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function OfflineCard() {
  const { sets } = useLearner();
  const online = useOnline();
  const urls = useMemo(() => mediaUrls(sets ?? []), [sets]);
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const supported = offlineSupported();

  const refresh = useCallback(() => {
    if (supported) offlineStatus(urls).then(setStatus, () => setStatus(null));
  }, [supported, urls]);
  useEffect(() => {
    refresh();
    if (!supported) return;
    // The worker finishes installing in the background on the first visit.
    navigator.serviceWorker.addEventListener('controllerchange', refresh);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', refresh);
  }, [refresh, supported]);

  const download = async () => {
    setFailed(false);
    setProgress({ done: 0, total: 0 });
    try {
      const missed = await downloadForOffline(urls, (done, total) => setProgress({ done, total }));
      setFailed(missed > 0);
    } catch {
      setFailed(true);
    }
    setProgress(null);
    refresh();
  };

  if (!supported) {
    return (
      <section className="card" aria-labelledby="offline-title">
        <h2 id="offline-title">{t('offlineTitle')}</h2>
        <p className="muted">{t('offlineUnsupported')}</p>
      </section>
    );
  }

  const ready = status !== null && status.app && status.savedAt !== null && status.missing === 0;
  return (
    <section className="card offline-card" aria-labelledby="offline-title">
      <h2 id="offline-title">{t('offlineTitle')}</h2>
      <p className="muted">{t('offlineIntro')}</p>
      <div role="status" className="offline-status">
        {progress ? (
          <p>
            {t('offlineDownloading', progress)}
            <progress max={Math.max(1, progress.total)} value={progress.done} />
          </p>
        ) : status ? (
          <>
            {ready && <p className="offline-ready">{t('offlineReady')}</p>}
            {status.savedAt ? <p className="muted">{t('offlineSavedAt', { date: savedFormat.format(status.savedAt) })}</p> : <p>{t('offlineNotYet')}</p>}
            {status.savedAt && status.missing > 0 && <p>{t('offlineMissing', { n: status.missing })}</p>}
            {!status.app && <p className="muted">{t('offlineAppPending')}</p>}
          </>
        ) : null}
        {failed && !progress && <p className="warning-text">{t('offlineFailed')}</p>}
      </div>
      <button className={`btn ${ready ? '' : 'btn-primary'}`} onClick={download} disabled={progress !== null || !online || !sets}>
        ⬇️ {ready ? t('offlineUpdate') : t('offlineDownload')}
      </button>
      {needsHomeScreen() && <p className="muted">{t('offlineIos')}</p>}
    </section>
  );
}
