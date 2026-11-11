/**
 * Small drawn icons for the learner menu, in the same ink line as the
 * mascots. They replace emoji, which look different on every phone.
 */
export type IconName = 'topics' | 'listen' | 'progress' | 'settings' | 'feedback' | 'exam' | 'sound' | 'mute';

const PATHS: Record<IconName, React.ReactNode> = {
  // A window with four shutters: one pane per topic.
  topics: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="#fff" />
      <path d="M12 3.5v17M3.5 12h17" />
      <rect x="6" y="6" width="3.5" height="3.5" rx="0.8" fill="#c23a2b" stroke="none" />
      <rect x="14.5" y="14.5" width="3.5" height="3.5" rx="0.8" fill="#1f6fb3" stroke="none" />
    </>
  ),
  listen: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#1f6fb3" strokeLinejoin="round" />
      <path d="M15.5 9.5q1.6 2.5 0 5M18.5 7q3.6 5 0 10" />
    </>
  ),
  // A mountain with a flag on top: how far you have climbed.
  progress: (
    <>
      <path d="M2.5 20.5 9 9.5l3.5 5.5 3-4 6 9.5z" fill="#5fa968" strokeLinejoin="round" />
      <path d="M15.5 11V3.5l4.5 1.8-4.5 1.8" fill="#e0a21c" strokeLinejoin="round" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2.3" fill="#e0a21c" />
      <circle cx="15.5" cy="12" r="2.3" fill="#1f6fb3" />
      <circle cx="7.5" cy="17" r="2.3" fill="#c23a2b" />
    </>
  ),
  // A school sheet with a tick.
  exam: (
    <>
      <path d="M6 2.5h9l3.5 3.5v15.5H6z" fill="#fff" strokeLinejoin="round" />
      <path d="M9 9.5h6.5M9 13h4" />
      <path d="m9.5 17 2 2 4-4.5" stroke="#1b5e33" strokeWidth="2.2" strokeLinejoin="round" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#fff" strokeLinejoin="round" />
      <path d="M15.5 9.5q1.6 2.5 0 5M18.5 7q3.6 5 0 10" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#fff" strokeLinejoin="round" />
      <path d="m15.5 9.5 5 5m0-5-5 5" />
    </>
  ),
  feedback: (
    <path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-9l-4.5 3.5V17H4a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 4 5.5z" fill="#fff" strokeLinejoin="round" />
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#13293d" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
