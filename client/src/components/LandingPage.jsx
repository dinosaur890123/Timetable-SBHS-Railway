import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import {
  ArrowRight, AlertOctagon, X, MapPin, UserRound, Clock, Home, CalendarDays, Newspaper,
  Award, Clipboard, GraduationCap
} from 'lucide-react';
import { performLogin, getOauthConfig } from '../services/api';
import { BrandMark } from './modern/ModernShell';

// App keeps html.dark set while signed out, so this page is always dark.

const ease = [0.2, 0.8, 0.2, 1];

const Label = ({ children, className = '' }) => (
  <div className={`font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-400 ${className}`}>
    {children}
  </div>
);

const PREVIEW_ROWS = [
  { time: '9:00', period: '1', title: 'English', meta: 'Ms Reid · 203', state: 'past' },
  { time: '10:05', period: '2', title: 'Physics', meta: 'Mr Hall for Mrs Shah · 307', state: 'current', sub: true },
  { break: 'Recess', time: '11:05' },
  { time: '11:25', period: '3', title: 'Design & Technology', meta: 'Mr Gray · 502, was 102', room: true },
  { time: '12:30', period: '4', title: 'Mathematics Ext. 2', meta: 'Mr Jones · 105' }
];

// A period is 60 minutes; the preview counts down through the back half of one and loops.
const PERIOD_SECONDS = 60 * 60;
const START_REMAINING = 24 * 60 + 13;

const useDemoCountdown = () => {
  const [remaining, setRemaining] = useState(START_REMAINING);
  useEffect(() => {
    const timer = setInterval(() => setRemaining(r => (r <= 60 ? START_REMAINING : r - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  return remaining;
};

const formatClock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// A faithful miniature of the signed-in home page, built from the same pieces.
const ProductPreview = () => {
  const remaining = useDemoCountdown();
  const progress = ((PERIOD_SECONDS - remaining) / PERIOD_SECONDS) * 100;

  return (
    <div className="relative rounded-2xl border border-m-line bg-m-panel m-shadow-lg overflow-hidden" aria-label="Preview of the Synchron home page">
      <div className="flex items-center justify-between h-11 px-4 border-b border-m-line">
        <span className="text-[13px] font-medium text-zinc-900 dark:text-white">My Synchron</span>
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Synced
        </span>
      </div>

      <div className="relative p-4 sm:p-5 space-y-4">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 m-dots" />

        <div className="relative">
          <div className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
            Good Morning, <span className="text-accent">Sam</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-zinc-500 dark:text-zinc-400">
            <span>Tuesday, 3 March</span>
            <span className="px-1.5 py-px rounded-md border border-m-line bg-white/[0.04] text-zinc-700 dark:text-zinc-200">Today is TueA</span>
          </div>
        </div>

        <div className="relative grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="min-w-0 rounded-xl border border-m-line bg-m-card p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <Label>Today’s variations</Label>
              <span className="font-mono text-[10px] w-4 h-4 grid place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">2</span>
            </div>
            <ul className="space-y-2 text-[12.5px]">
              <li>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400">P2</span>
                  <span className="font-medium text-zinc-900 dark:text-white">Physics</span>
                </div>
                <div className="pl-5 flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                  <UserRound size={11} /> Mr Hall covering
                </div>
              </li>
              <li>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400">P3</span>
                  <span className="font-medium text-zinc-900 dark:text-white truncate">Design &amp; Technology</span>
                </div>
                <div className="pl-5 flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <MapPin size={11} /> 102 → 502
                </div>
              </li>
            </ul>
          </div>

          <div className="min-w-0 rounded-xl border border-m-line bg-m-card p-3.5 flex flex-col">
            <div className="flex items-center justify-between mb-2.5">
              <Label>Now · Period 2</Label>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 hidden sm:inline">Next: Recess</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-zinc-900 dark:text-white">Physics</div>
                <div className="mt-1 flex items-center gap-2.5 text-[11.5px] text-zinc-500 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1"><Clock size={11} /> 10:05</span>
                  <span className="inline-flex items-center gap-1"><MapPin size={11} /> 307</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-white leading-none">
                  {formatClock(remaining)}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">left</div>
              </div>
            </div>
            <div className="mt-auto pt-3">
              <div className="h-1 rounded-full bg-white/[0.08] overflow-hidden">
                <div className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </div>

        <ol className="relative rounded-xl border border-m-line bg-m-card p-1.5 space-y-0.5" aria-label="Example timetable">
          {PREVIEW_ROWS.map((row) => row.break ? (
            <li key={row.break} className="flex items-center gap-3 px-2 py-1">
              <span className="w-10 text-right text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400">{row.time}</span>
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{row.break}</span>
              <span className="flex-1 h-px bg-white/[0.07]" />
            </li>
          ) : (
            <li
              key={row.period}
              className={`flex items-center gap-3 rounded-lg px-2 py-2 ${row.state === 'current' ? 'bg-white/[0.05] ring-1 ring-accent/60' : ''} ${row.state === 'past' ? 'opacity-45' : ''}`}
            >
              <span className={`w-10 text-right text-[12px] tabular-nums ${row.state === 'current' ? 'text-zinc-900 dark:text-white font-medium' : 'text-zinc-600 dark:text-zinc-400'}`}>{row.time}</span>
              <span className={`w-5 h-5 shrink-0 grid place-items-center rounded-md text-[11px] font-medium ${row.state === 'current' ? 'bg-accent text-accent-contrast' : 'bg-white/[0.06] text-zinc-600 dark:text-zinc-300'}`}>
                {row.period}
              </span>
              <div className="min-w-0 flex-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{row.title}</span>
                <span className={`hidden sm:block truncate text-[11.5px] ${row.room ? 'text-amber-600 dark:text-amber-400' : row.sub ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                  {row.meta}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

// Mirrors the signed-in sidebar, so the page doubles as a map of the app.
const SECTIONS = [
  {
    label: 'Workspace',
    items: [
      { icon: Home, title: 'My Synchron', body: 'Today’s timetable with substitutes and room moves already applied, and a countdown to the bell.' },
      { icon: CalendarDays, title: 'Calendar', body: 'Term dates, events and which week of the cycle you’re in.' },
      { icon: Newspaper, title: 'Notices', body: 'The daily notices, readable on a phone.' }
    ]
  },
  {
    label: 'School',
    items: [
      { icon: Award, title: 'Awards', body: 'Your award scheme points and badges.' },
      { icon: Clipboard, title: 'Clipboard', body: 'Sport and training sessions from Clipboard.' },
      { icon: GraduationCap, title: 'Study', body: 'NoteFlow, the all-in-one study app with an AI tutor.' }
    ]
  }
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
              Kept on the server (<code className="font-mono text-xs">SBHS_CLIENT_SECRET</code>)
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

const LandingPage = ({ authError, clearAuthError }) => {
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
      <div className="min-h-[100dvh] bg-m-page md:p-2 text-zinc-900 dark:text-zinc-100">
        <AnimatePresence>
          {authError && <AuthErrorDialog authError={authError} onDismiss={clearAuthError} />}
        </AnimatePresence>

        {/* The same inset panel the signed-in app lives in */}
        <div className="relative isolate flex min-h-[100dvh] md:min-h-[calc(100dvh-1rem)] flex-col overflow-hidden bg-m-panel md:rounded-2xl md:border border-m-line">
          <header className="sticky top-0 z-30 border-b border-m-line bg-m-panel/80 backdrop-blur-xl">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
              <button onClick={handleLogoClick} className="flex min-w-0 items-center gap-2.5" aria-label="Synchron">
                {useOriginalMark ? (
                  <span className="grid shrink-0 grid-cols-2 gap-0.5 p-1.5 rounded-lg bg-white">
                    {[0, 1, 2, 3].map(i => <span key={i} className="w-1.5 h-1.5 rounded-[2px] bg-zinc-900" />)}
                  </span>
                ) : (
                  <BrandMark />
                )}
                <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white">Synchron</span>
              </button>
              <nav className="hidden items-center gap-4 sm:flex sm:gap-5" aria-label="Landing">
                <a href="#whats-inside" className="text-[13px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">What’s inside</a>
                <a href="/privacy" className="text-[13px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Privacy</a>
              </nav>
              <button
                onClick={performLogin}
                className="h-11 shrink-0 px-4 sm:h-8 sm:px-3 rounded-lg border border-m-line bg-m-card text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                Sign in
              </button>
            </div>
          </header>

          <div aria-hidden className="pointer-events-none absolute -z-10 inset-x-0 top-14 h-[28rem] m-dots" />

          <main className="flex-1">
            <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-14 pb-16 sm:px-8 md:pt-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:pb-24">
              <motion.div
                initial={{ opacity: 1, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease }}
              >
                <h1 className="text-[2.2rem] sm:text-6xl font-semibold leading-[1.02] tracking-[-0.035em] text-zinc-900 dark:text-white">
                  Your timetable,
                  <br />
                  <span className="text-accent">live.</span>
                </h1>
                <p className="mt-6 max-w-md text-base sm:text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                  A quick, one-stop app for your day. By students, for students at Sydney Boys High School.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <button
                    onClick={performLogin}
                    className="group inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-900 dark:bg-white px-5 text-sm font-medium text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                  >
                    Sign in with SBHS
                    <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
                <p className="mt-6 max-w-sm text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Your browser may ask for local network access when you sign in. Choose Allow so Synchron can sync.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 1, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.12, ease }}
              >
                <ProductPreview />
              </motion.div>
            </section>

            <section id="whats-inside" className="border-t border-m-line scroll-mt-16">
              <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 md:py-20">
                <div className="grid gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)] md:gap-16">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">What’s inside</h2>
                    <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      The same pages you’ll see in the sidebar once you sign in.
                    </p>
                  </div>
                  <div className="grid gap-10 sm:grid-cols-2">
                    {SECTIONS.map(section => (
                      <div key={section.label}>
                        <Label className="mb-3">{section.label}</Label>
                        <ul className="divide-y divide-white/[0.06] border-y border-m-line">
                          {section.items.map(({ icon: Icon, title, body }) => (
                            <li key={title} className="flex gap-3 py-3.5">
                              <Icon size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
                              <div>
                                <div className="text-sm font-medium text-zinc-900 dark:text-white">{title}</div>
                                <p className="mt-0.5 text-base sm:text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </main>

          <footer className="border-t border-m-line">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">© {new Date().getFullYear()} Synchron</span>
              <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400" aria-label="Footer">
                <a href="#whats-inside" className="hover:text-zinc-900 dark:hover:text-white transition-colors">What’s inside</a>
                <a href="/privacy" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Privacy</a>
                <span>Built independently for SBHS</span>
              </nav>
            </div>
          </footer>
        </div>
      </div>
    </MotionConfig>
  );
};

export default LandingPage;
