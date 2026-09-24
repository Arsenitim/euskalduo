import { useRef, useState } from 'react';
import { MAX_MESSAGE, sendFeedback, shrinkScreenshot, type FeedbackResult } from '../../api/feedback';
import { t } from '../../i18n';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; text: string };

function errorText(result: Exclude<FeedbackResult, { ok: true }>): string {
  switch (result.reason) {
    case 'full':
      return result.contact ? t('feedbackFullContact', { contact: result.contact }) : t('feedbackFull');
    case 'rate_limited':
      return t('feedbackRateLimited');
    case 'bad_image':
    case 'too_big':
      return t('feedbackBadImage');
    case 'invalid':
      return t('feedbackEmpty');
    case 'network':
      return t('feedbackNetwork');
  }
}

/** Header button plus the modal form. The draft survives closing the dialog until it is sent. */
export function FeedbackButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<{ file: File; preview: string } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // Contents render only while open, so the closed form is not in the page.
  const [isOpen, setOpen] = useState(false);

  const pickScreenshot = (file: File | undefined) => {
    if (file) setScreenshot({ file, preview: URL.createObjectURL(file) });
  };

  const clearScreenshot = () => {
    if (screenshot) URL.revokeObjectURL(screenshot.preview);
    setScreenshot(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const open = () => {
    if (status.kind !== 'sending') setStatus({ kind: 'idle' });
    setOpen(true);
    dialogRef.current?.showModal();
  };

  const close = () => dialogRef.current?.close();

  const onClosed = () => {
    setOpen(false);
    if (status.kind === 'sent') {
      setName('');
      setMessage('');
      clearScreenshot();
      setStatus({ kind: 'idle' });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return setStatus({ kind: 'error', text: t('feedbackEmpty') });
    setStatus({ kind: 'sending' });
    const result = await sendFeedback({ name, message, screenshot: screenshot && (await shrinkScreenshot(screenshot.file)) });
    setStatus(result.ok ? { kind: 'sent' } : { kind: 'error', text: errorText(result) });
  };

  const sending = status.kind === 'sending';

  return (
    <>
      <button type="button" className="nav-button" onClick={open} aria-haspopup="dialog">
        <span aria-hidden="true">💬</span> <span className="nav-button-label">{t('navFeedback')}</span>
      </button>
      <dialog ref={dialogRef} className="feedback-dialog" aria-labelledby="feedback-title" onClose={onClosed}>
        {isOpen && <h2 id="feedback-title">{t('feedbackTitle')}</h2>}
        {!isOpen ? null : status.kind === 'sent' ? (
          <div className="feedback-sent">
            <p className="status-line" role="status">
              {t('feedbackThanks')}
            </p>
            <div className="button-row">
              <button type="button" className="btn btn-primary" onClick={close} autoFocus>
                {t('close')}
              </button>
            </div>
          </div>
        ) : (
          <form className="feedback-form" onSubmit={submit}>
            <p className="muted">{t('feedbackIntro')}</p>
            <label htmlFor="feedback-message">{t('feedbackMessage')}</label>
            <textarea
              id="feedback-message"
              value={message}
              rows={5}
              maxLength={MAX_MESSAGE}
              required
              autoFocus
              onChange={(e) => setMessage(e.target.value)}
            />
            <label htmlFor="feedback-name">{t('feedbackName')}</label>
            <input id="feedback-name" value={name} maxLength={80} autoComplete="off" onChange={(e) => setName(e.target.value)} />

            <span className="feedback-label">{t('feedbackScreenshot')}</span>
            {screenshot ? (
              <div className="feedback-preview">
                <img src={screenshot.preview} alt={t('feedbackScreenshotAlt')} />
                <button type="button" className="btn btn-small" onClick={clearScreenshot}>
                  {t('feedbackRemoveScreenshot')}
                </button>
              </div>
            ) : (
              <label className="btn btn-small feedback-attach">
                📎 {t('feedbackAttach')}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  onChange={(e) => pickScreenshot(e.target.files?.[0])}
                />
              </label>
            )}

            <p className="muted small">{t('feedbackWhatIsSent')}</p>
            {status.kind === 'error' && (
              <p className="feedback-error" role="alert">
                {status.text}
              </p>
            )}
            <div className="button-row">
              <button type="submit" className="btn btn-primary" disabled={sending}>
                {sending ? t('feedbackSending') : t('feedbackSend')}
              </button>
              <button type="button" className="btn" onClick={close}>
                {t('cancel')}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
