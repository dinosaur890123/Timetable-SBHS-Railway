import React, { useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { ArrowRight, AlertOctagon, X } from 'lucide-react';
import { performLogin, getOauthConfig } from '../services/api';
import { BrandMark } from './modern/ModernShell';

// App keeps html.dark set while signed out, so this page is always dark.

const PREVIEW = [
  { time: '9:00', title: 'English', detail: 'Ms R · 203', state: 'past' },
  { time: '10:05', title: 'Physics', detail: 'Mr H for Mrs S · 307', state: 'current' },
  { time: '11:25', title: 'Design & Technology', detail: 'Mr G · 502, was 102', state: 'changed' },
  { time: '12:30', title: 'Mathematics Ext. 2', detail: 'Mr J · 105' }
];

const AuthErrorDialog = ({ authError, onDismiss }) => {
  const config = getOauthConfig();

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="absolute inset-0 bg-black/70" onClick={onDismiss} />
      <motion.div
        role="alertdialog"
        aria-labelledby="auth-error-title"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-m-line bg-m-card p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <AlertOctagon size={18} className="text-rose-400 shrink-0" />
            <h3 id="auth-error-title" className="text-base font-semibold text-white">Sign-in failed</h3>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-m-line bg-m-panel p-3.5 font-mono text-xs text-zinc-300 break-all">
          {authError}
        </div>

        <ol className="mb-5 space-y-2.5 text-sm text-zinc-400 list-decimal pl-5 marker:text-zinc-600">
          <li>
            <span className="text-zinc-100">Redirect URI.</span> The redirect URL in the SBHS developer portal must exactly match{' '}
            <code className="rounded bg-m-panel px-1.5 py-0.5 font-mono text-xs text-zinc-100">{config.redirectUri}</code>.
          </li>
          <li>
            <span className="text-zinc-100">Client secret.</span> The developer portal client secret must match the one provided in settings.
          </li>
          <li>
            <span className="text-zinc-100">Redeploy the client.</span> Vite reads this config at build time, so after changing environment variables in Railway you must trigger a new frontend deployment.
          </li>
        </ol>

        <dl className="rounded-xl border border-m-line bg-m-panel p-3.5 font-mono text-xs space-y-1.5">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Client ID</dt>
            <dd className="text-zinc-300 truncate">{config.clientId}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Redirect URI</dt>
            <dd className="text-zinc-300 truncate">{config.redirectUri}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Client secret</dt>
            <dd className="text-zinc-300">
              {config.hasClientSecret ? `Present (length ${config.clientSecretLength})` : 'Not present'}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onDismiss}
            className="h-9 px-4 rounded-lg text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              onDismiss();
              performLogin();
            }}
            className="h-9 px-4 rounded-lg bg-white text-zinc-950 text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            Try again
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const LandingPage = ({ authError, clearAuthError, supporters }) => {
  // Easter egg: three clicks on the logo bring back the original four-square mark.
  const [logoClicks, setLogoClicks] = useState(0);
  const [useOriginalMark, setUseOriginalMark] = useState(false);

  const handleLogoClick = () => {
    setLogoClicks(prev => {
      if (prev + 1 >= 3) {
        setUseOriginalMark(true);
        return 0;
      }
      return prev + 1;
    });
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-[100dvh] flex-col bg-m-page text-zinc-100">
        <AnimatePresence>
          {authError && <AuthErrorDialog authError={authError} onDismiss={clearAuthError} />}
        </AnimatePresence>

        <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5 sm:px-8">
          <button onClick={handleLogoClick} className="flex items-center gap-2.5" aria-label="Synchron">
            {useOriginalMark ? (
              <span className="grid grid-cols-2 gap-0.5 p-1.5 rounded-lg bg-white">
                {[0, 1, 2, 3].map(i => <span key={i} className="w-1.5 h-1.5 rounded-[2px] bg-zinc-900" />)}
              </span>
            ) : (
              <BrandMark />
            )}
            <span className="text-[15px] font-semibold tracking-tight text-white">Synchron</span>
          </button>
          <button onClick={performLogin} className="text-sm text-zinc-400 hover:text-white transition-colors">
            Sign in
          </button>
        </header>

        <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-14 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-20">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <h1 className="text-4xl sm:text-5xl font-semibold leading-[1.08] tracking-[-0.03em] text-white">
              Your timetable,
              <br />
              live.
            </h1>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-zinc-400">
              Periods, room changes, substitutes and notices for Sydney Boys High, in one fast app.
            </p>
            <button
              onClick={performLogin}
              className="group mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 transition-colors"
            >
              Sign in with SBHS
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </button>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-zinc-500">
              Your browser may ask for Local network access when you sign in. Choose Allow so Synchron can sync.
            </p>
          </motion.div>

          <motion.ol
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            aria-label="Example timetable"
            className="rounded-2xl border border-m-line bg-m-panel p-2"
          >
            {PREVIEW.map(({ time, title, detail, state }) => (
              <li
                key={time}
                className={`flex items-center gap-4 rounded-xl px-3.5 py-3 ${state === 'current' ? 'bg-white/[0.06]' : ''} ${state === 'past' ? 'opacity-40' : ''}`}
              >
                <span className="w-11 shrink-0 text-sm tabular-nums text-zinc-500">{time}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-100">{title}</div>
                  <div className={`truncate text-xs ${state === 'changed' ? 'text-amber-400' : 'text-zinc-500'}`}>{detail}</div>
                </div>
                {state === 'current' && <span className="shrink-0 text-xs tabular-nums text-zinc-300">24m left</span>}
              </li>
            ))}
          </motion.ol>
        </main>

        <footer className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-5 py-6 text-xs text-zinc-600 sm:flex-row sm:justify-between sm:px-8">
          <span>© {new Date().getFullYear()} Synchron</span>
          <span>
            Built independently for Sydney Boys High School.
            {supporters && supporters.length > 0 && ' Thanks to our Pro supporters.'}
          </span>
        </footer>
      </div>
    </MotionConfig>
  );
};

export default LandingPage;
