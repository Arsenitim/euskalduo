import type { Entry } from '../../types';
import { t } from '../../i18n';

export function WordVisual({ entry, size = 'large' }: { entry: Entry; size?: 'large' | 'small' }) {
  if (entry.image) {
    return <img className={`word-visual word-visual-${size}`} src={entry.image} alt="" loading="lazy" />;
  }
  if (entry.emoji) {
    return (
      <span className={`word-visual word-emoji word-visual-${size}`} aria-hidden="true">
        {entry.emoji}
      </span>
    );
  }
  return null;
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="progress">
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="progress-label">{label}</span>
    </div>
  );
}

export function Stars({ count, big = false }: { count: number; big?: boolean }) {
  return (
    <span className={big ? 'stars stars-big' : 'stars'} role="img" aria-label={t('starsLabel', { n: count })}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < count ? 'star star-on' : 'star'} aria-hidden="true">
          {i < count ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

export function SampleBadge() {
  return <span className="badge badge-sample">{t('sample')}</span>;
}
