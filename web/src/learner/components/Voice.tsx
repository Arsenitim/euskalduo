import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { t } from '../../i18n';
import type { Entry } from '../../types';
import { useLearner } from '../LearnerContext';
import { stopSounds } from '../sounds';
import { playVoice, setVoiceEnabled, stopVoice } from '../voice';

/** Own playback lifecycle at the learner level, including route exits. */
export function VoiceLifecycle() {
  const { state } = useLearner();
  const location = useLocation();
  useEffect(() => {
    setVoiceEnabled(state.sound);
    if (!state.sound) stopSounds();
  }, [state.sound]);
  useEffect(() => () => { stopVoice(); stopSounds(); }, [location.key]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { stopVoice(); stopSounds(); } };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); stopVoice(); };
  }, []);
  return null;
}

export function VoiceButton({ entries }: { entries: Entry[] }) {
  const { state } = useLearner();
  if (!entries.some((entry) => entry.audio)) return null;
  return <button type="button" lang="es" className="btn btn-small voice-button"
    disabled={!state.sound} aria-label={t('listenTo', { word: entries.map((e) => e.basque).join(', ') })}
    onClick={() => { stopSounds(); playVoice(entries.map((e) => e.audio)); }}>
    <span aria-hidden="true">🔊</span>
  </button>;
}
