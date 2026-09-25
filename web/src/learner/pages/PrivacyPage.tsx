import { t } from '../../i18n';

export function PrivacyPage() {
  return (
    <div className="card prose">
      <h1>{t('privacyTitle')}</h1>
      <p>{t('privacyP1')}</p>
      <p>{t('privacyP2')}</p>
      <p>{t('privacyStats')}</p>
      <p>{t('privacyFeedback')}</p>
      <p>{t('privacyP3')}</p>
      <p className="muted">{t('privacyP4')}</p>
    </div>
  );
}
