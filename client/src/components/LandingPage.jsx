import React, { useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { ArrowRight, AlertOctagon, X } from 'lucide-react';
import { performLogin, getOauthConfig } from '../services/api';
import { BrandMark, StagingBadge } from './modern/ModernShell';
import AmbientLight from './modern/AmbientLight';

const FEATURES = [
  { title: 'Timetable', description: 'Daily periods, bell countdown, room moves, and substitute teachers.' },
  { title: 'Notices & Calendar', description: 'Daily notices filtered by year group, term dates, and cycle weeks.' },
  { title: 'Clipboard & Awards', description: 'Sport sessions, venues, and award scheme progress.' },
  { title: 'Offline support', description: 'Caches your schedule on this device and installs as an app.' }
];

const AuthErrorDialog = ({ authError, onDismiss }) => {
  const config = getOauthConfig();
  const isNetworkFailure = /failed to fetch|load failed|network|connection|timed out|abort|local network|permission|ERR_LOCAL_NETWORK|ERR_BLOCKED_BY|ERR_FAILED/i.test(authError);
  const isConfigFailure = /invalid_client|unauthorized_client|redirect.?uri|client secret|missing client id/i.test(authError);

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
            <AlertOctagon size={18} className="text-rose-500 dark:text-rose-400 shrink-0" />
            <h3 id="auth-error-title" className="text-base font-semibold text-zinc-900 dark:text-white">Sign-in failed</h3>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-m-line bg-m-panel p-3.5 font-mono text-xs text-zinc-700 dark:text-zinc-300 break-all">
          {authError}
        </div>

        {isNetworkFailure ? (
          <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">Check this site’s network permission</p>
            <p className="mt-1.5">
              If you previously blocked a browser prompt for local network access, open this site’s controls beside the address bar, find its permissions, and change <span className="font-medium text-zinc-900 dark:text-zinc-100">Local network access</span> to Allow. The setting name may vary by browser. Then reload this page and sign in again.
            </p>
          </div>
        ) : isConfigFailure ? (
          <>
            <ol className="mb-5 space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400 list-decimal pl-5 marker:text-zinc-400 dark:marker:text-zinc-600">
              <li>
                <span className="text-zinc-900 dark:text-zinc-100">Redirect URI.</span> The redirect URL in the SBHS developer portal must exactly match{' '}
                <code className="rounded bg-m-panel px-1.5 py-0.5 font-mono text-xs text-zinc-800 dark:text-zinc-100">{config.redirectUri}</code>.
              </li>
              <li>
                <span className="text-zinc-900 dark:text-zinc-100">Client secret.</span> The developer portal client secret must match the one provided in settings.
              </li>
              <li>
                <span className="text-zinc-900 dark:text-zinc-100">Redeploy the client.</span> Vite reads this config at build time, so after changing environment variables in Railway you must trigger a new frontend deployment.
              </li>
            </ol>

            <dl className="rounded-xl border border-m-line bg-m-panel p-3.5 font-mono text-xs space-y-1.5">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">Client ID</dt>
                <dd className="text-zinc-700 dark:text-zinc-300 truncate">{config.clientId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">Redirect URI</dt>
                <dd className="text-zinc-700 dark:text-zinc-300 truncate">{config.redirectUri}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">Client secret</dt>
                <dd className="text-zinc-700 dark:text-zinc-300">
                  Kept on the server (<code className="font-mono text-xs">SBHS_CLIENT_SECRET</code>)
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mb-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Try signing in again. If it keeps returning here, share this error with the Synchron team.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onDismiss}
            className="h-9 px-4 rounded-lg text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              onDismiss();
              performLogin();
            }}
            className="h-9 px-4 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            Try again
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const LandingPage = ({ authError, clearAuthError, festiveAmbient = false }) => {
  const [, setLogoClicks] = useState(0);
  const [useOriginalMark, setUseOriginalMark] = useState(false);
  const [ambientOn] = useState(() => {
    try { return localStorage.getItem('ambient_light') !== 'off'; } catch { return true; }
  });

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
      <div className="min-h-[100dvh] bg-m-page md:p-2 text-zinc-100">
        <div className="relative isolate flex min-h-[100dvh] md:min-h-[calc(100dvh-1rem)] flex-col overflow-hidden bg-m-panel md:rounded-2xl md:border border-m-line">
          <AnimatePresence>
            {authError && <AuthErrorDialog authError={authError} onDismiss={clearAuthError} />}
          </AnimatePresence>

          {ambientOn && <AmbientLight variant="panel" festive={festiveAmbient} />}

          <header className="relative z-30 border-b border-m-line bg-m-panel/75 backdrop-blur-xl">
            <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-5 sm:px-8">
              <button onClick={handleLogoClick} className="flex min-w-0 items-center gap-2.5" aria-label="Synchron">
                {useOriginalMark ? (
                  <span className="grid shrink-0 grid-cols-2 gap-0.5 p-1.5 rounded-lg bg-white">
                    {[0, 1, 2, 3].map(i => <span key={i} className="w-1.5 h-1.5 rounded-[2px] bg-zinc-900" />)}
                  </span>
                ) : (
                  <BrandMark />
                )}
                <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-white">Synchron</span>
                <StagingBadge />
              </button>
              <a
                href="/privacy"
                className="text-[13px] font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Privacy
              </a>
            </div>
          </header>

          <main className="flex-1 flex items-center">
            <div className="mx-auto w-full max-w-xl px-5 py-12 sm:px-8">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                Sydney Boys High School
              </div>
              <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-white">
                Synchron
              </h1>
              <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-zinc-400">
                Your timetable, daily notices, calendar, Clipboard sessions, awards, and Canvas links in one place.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <button
                  onClick={performLogin}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 transition-colors"
                >
                  Sign in with SBHS
                  <ArrowRight size={15} />
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                If your browser prompts for local network access on sign-in, allow it so Synchron can sync.
              </p>

              <ul className="mt-10 grid gap-x-8 gap-y-5 border-t border-m-line pt-7 sm:grid-cols-2">
                {FEATURES.map(item => (
                  <li key={item.title}>
                    <div className="text-[13px] font-medium text-zinc-200">{item.title}</div>
                    <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{item.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          </main>

          <footer className="border-t border-m-line">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500">
                © Synchron {new Date().getFullYear()}
              </span>
              <nav className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500" aria-label="Footer">
                <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
                <a href="https://student.sbhs.net.au" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">SBHS portal</a>
              </nav>
            </div>
          </footer>
        </div>
      </div>
    </MotionConfig>
  );
};

export default LandingPage;
