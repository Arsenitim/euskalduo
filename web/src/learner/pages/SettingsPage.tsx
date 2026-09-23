import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../../i18n';
import { useLearner } from '../LearnerContext';
import { exportProgress, importProgress } from '../progress';

export function SettingsPage() {
  const { state, update, reset, storageOk } = useLearner();
  const [name, setName] = useState(state.displayName);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const download = () => {
    // Created and saved entirely in the browser; nothing is uploaded.
    const blob = new Blob([exportProgress(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `euskalduo-progreso-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    const imported = file.size < 2_000_000 ? importProgress(await file.text()) : null;
    if (imported) {
      update(() => imported);
      setName(imported.displayName);
      setMessage(t('importOk'));
    } else {
      setMessage(t('importBad'));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="settings">
      <h1>{t('settingsTitle')}</h1>
      {!storageOk && (
        <p className="card warning" role="alert">
          {t('storageUnavailable')}
        </p>
      )}
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          update((s) => ({ ...s, displayName: name.trim().slice(0, 40) }));
          setMessage(t('saved'));
        }}
      >
        <label htmlFor="name">{t('yourName')}</label>
        <div className="inline-form">
          <input id="name" value={name} maxLength={40} autoComplete="off" onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary" type="submit">
            {t('save')}
          </button>
        </div>
        <p className="muted">{t('nameHint')}</p>
      </form>

      <fieldset className="card">
        <legend>{t('meaningLang')}</legend>
        {(['es', 'ru'] as const).map((lang) => (
          <label key={lang} className="radio">
            <input type="radio" name="lang" checked={state.lang === lang} onChange={() => update((s) => ({ ...s, lang }))} />{' '}
            {lang === 'es' ? t('langEs') : t('langRu')}
          </label>
        ))}
      </fieldset>

      <fieldset className="card">
        <legend>{t('soundSetting')}</legend>
        {([true, false] as const).map((on) => (
          <label key={String(on)} className="radio">
            <input type="radio" name="sound" checked={state.sound === on} onChange={() => update((s) => ({ ...s, sound: on }))} />{' '}
            {on ? `🔊 ${t('soundYes')}` : `🔇 ${t('soundNo')}`}
          </label>
        ))}
      </fieldset>

      <div className="card">
        <p className="muted">
          {t('privacyP3')} <Link to="/privacidad">{t('navPrivacy')}</Link>
        </p>
        <div className="button-row">
          <button className="btn" onClick={download}>
            ⬇️ {t('exportProgress')}
          </button>
          <label className="btn">
            ⬆️ {t('importProgress')}
            <input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={(e) => load(e.target.files?.[0])} />
          </label>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm(t('resetConfirm'))) {
                reset();
                setName('');
                setMessage(t('resetDone'));
              }
            }}
          >
            🗑️ {t('resetProgress')}
          </button>
        </div>
      </div>
      <p role="status" className="status-line">
        {message}
      </p>
    </div>
  );
}
